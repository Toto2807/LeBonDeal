// Suppression et réordonnancement des photos d'une annonce — nécessite PostgreSQL et MongoDB.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { app, request, query, setup, teardown, newUser, postAd, postPhotos } from './helpers.js';
import { config } from '../../src/config/env.js';

let owner;
let other;

before(async () => {
  await setup();
  owner = await newUser('photographe');
  other = await newUser('curieux');
});
after(teardown);

const fileExists = (publicUrl) =>
  access(path.join(config.uploadDir, path.basename(publicUrl))).then(() => true, () => false);
const images = async (adId) => (await request(app).get(`/api/ads/${adId}`).set(owner.auth)).body.data.images;
const removeImage = (adId, imageId, user) => {
  const call = request(app).delete(`/api/ads/${adId}/images/${imageId}`);
  return user ? call.set(user.auth) : call;
};
const reorder = (adId, user, ids) => {
  const call = request(app).patch(`/api/ads/${adId}/images/order`);
  return (user ? call.set(user.auth) : call).send({ ids });
};
const adWithPhotos = async (title, count = 3) => {
  const ad = await postAd(owner, { title });
  return { ad, photos: await postPhotos(owner, ad.id, count) };
};

// ── Suppression ─────────────────────────────────────────────────────────────

test('supprimer la photo du milieu efface ses fichiers et renumérote les autres', async () => {
  const { ad, photos } = await adWithPhotos('Annonce suppression photo');
  const [first, middle, last] = photos;
  assert.ok(await fileExists(middle.url) && await fileExists(middle.thumbUrl));

  const response = await removeImage(ad.id, middle.id, owner);
  assert.equal(response.status, 204);

  assert.equal(await fileExists(middle.url), false, 'grande photo effacée du disque');
  assert.equal(await fileExists(middle.thumbUrl), false, 'miniature effacée du disque');
  assert.ok(await fileExists(first.url) && await fileExists(last.url), 'les autres photos sont intactes');

  const remaining = await images(ad.id);
  assert.deepEqual(remaining.map((image) => image.id), [first.id, last.id]);
  assert.deepEqual(remaining.map((image) => image.position), [0, 1]);

  // ajouter une photo ensuite doit prendre la position suivante sans conflit
  const added = await postPhotos(owner, ad.id, 1);
  assert.equal(added[0].position, 2);
});

test('suppression refusée : sans jeton, par un tiers, photo inconnue ou appartenant à une autre annonce', async () => {
  const { ad, photos } = await adWithPhotos('Annonce suppression refusee', 2);
  const { photos: otherPhotos } = await adWithPhotos('Autre annonce du meme vendeur', 1);

  assert.equal((await removeImage(ad.id, photos[0].id, null)).status, 401);
  assert.equal((await removeImage(ad.id, photos[0].id, other)).status, 403);
  assert.equal((await removeImage(ad.id, 'pas-un-uuid', owner)).status, 400);

  const unknown = await removeImage(ad.id, '00000000-0000-4000-8000-000000000000', owner);
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'IMAGE_NOT_FOUND');
  assert.equal((await removeImage(ad.id, otherPhotos[0].id, owner)).status, 404, "la photo d'une autre annonce n'est pas supprimable ici");

  assert.equal((await images(ad.id)).length, 2, 'rien n\'a été supprimé');
  assert.ok(await fileExists(photos[0].url));
});

test('une annonce vendue n\'a plus de photos modifiables', async () => {
  const { ad, photos } = await adWithPhotos('Annonce vendue photos', 2);
  await query("UPDATE ads SET status = 'sold' WHERE id = $1", [ad.id]);
  const refused = await removeImage(ad.id, photos[0].id, owner);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.error.code, 'AD_NOT_EDITABLE');
});

// ── Réordonnancement ────────────────────────────────────────────────────────

test('réordonner les photos applique le nouvel ordre, positions toujours uniques', async () => {
  const { ad, photos } = await adWithPhotos('Annonce ordre photos');
  const reversed = [...photos].reverse().map((photo) => photo.id);

  const response = await reorder(ad.id, owner, reversed);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.map((image) => image.id), reversed);
  assert.deepEqual(response.body.data.map((image) => image.position), [0, 1, 2]);

  assert.deepEqual((await images(ad.id)).map((image) => image.id), reversed, 'relu dans le nouvel ordre');
  const positions = await query('SELECT count(DISTINCT position)::int AS n FROM ad_images WHERE ad_id = $1', [ad.id]);
  assert.equal(positions[0].n, 3);
});

test('un ordre invalide est refusé en bloc et ne change rien', async () => {
  const { ad, photos } = await adWithPhotos('Annonce ordre invalide');
  const { photos: foreign } = await adWithPhotos('Annonce etrangere ordre', 1);
  const [a, b, c] = photos.map((photo) => photo.id);
  const original = (await images(ad.id)).map((image) => image.id);

  const invalidOrders = {
    'identifiant manquant': [a, b],
    'doublon': [a, a, b],
    "photo d'une autre annonce": [a, b, foreign[0].id],
    'identifiant en trop': [a, b, c, foreign[0].id],
    'identifiant inconnu': [a, b, '00000000-0000-4000-8000-000000000000'],
  };
  for (const [label, ids] of Object.entries(invalidOrders)) {
    const response = await reorder(ad.id, owner, ids);
    assert.equal(response.status, 400, label);
    assert.equal(response.body.error.code, 'INVALID_ORDER', label);
  }
  for (const body of [[], 'abc', ['pas-un-uuid']]) {
    assert.equal((await reorder(ad.id, owner, body)).status, 400);
  }
  assert.deepEqual((await images(ad.id)).map((image) => image.id), original, 'ordre inchangé');

  assert.equal((await reorder(ad.id, null, [c, b, a])).status, 401);
  assert.equal((await reorder(ad.id, other, [c, b, a])).status, 403);
  assert.deepEqual((await images(ad.id)).map((image) => image.id), original, "le tiers n'a rien changé");
});
