// Lecture d'une annonce et « mes annonces » — nécessite PostgreSQL et MongoDB.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app, request, query, setup, teardown, newUser, postAd, postPhotos } from './helpers.js';

let owner;
let visitor;

before(async () => {
  await setup();
  owner = await newUser('vendeur');
  visitor = await newUser('visiteur');
});
after(teardown);

const setStatus = (adId, status) =>
  query("UPDATE ads SET status = $2::ad_status, deleted_at = CASE WHEN $2::text = 'deleted' THEN now() END WHERE id = $1", [adId, status]);
const read = (adId, user) => {
  const get = request(app).get(`/api/ads/${adId}`);
  return user ? get.set(user.auth) : get;
};

test('une annonce active est lisible par un anonyme avec toutes ses informations', async () => {
  const ad = await postAd(owner, { title: 'Peugeot 208 lecture' });
  await postPhotos(owner, ad.id, 3);

  const response = await read(ad.id);
  assert.equal(response.status, 200);
  const detail = response.body.data;

  assert.equal(detail.id, ad.id);
  assert.equal(detail.title, 'Peugeot 208 lecture');
  assert.equal(detail.priceCents, 850000);
  assert.equal(detail.status, 'active');
  assert.equal(detail.city, 'Lyon');
  assert.equal(detail.postalCode, '69003');
  assert.equal(detail.shippingAvailable, false);
  assert.ok(!Number.isNaN(Date.parse(detail.publishedAt)));
  // coordonnées arrondies à 2 décimales (≈ 1 km) : la position exacte n'est jamais publiée
  assert.equal(detail.lat, 45.76);
  assert.equal(detail.lng, 4.84);

  assert.equal(detail.category.slug, 'voitures');
  assert.equal(detail.category.name, 'Voitures');
  assert.deepEqual(detail.category.parent, { slug: 'vehicules', name: 'Véhicules' });

  assert.equal(detail.images.length, 3);
  assert.deepEqual(detail.images.map((image) => image.position), [0, 1, 2]);
  for (const image of detail.images) {
    assert.ok(image.id && image.url.startsWith('/uploads/') && image.thumbUrl.endsWith('-thumb.webp'));
  }

  assert.equal(detail.attributes.carburant, 'Diesel');
  assert.equal(detail.attributes.kilometrage, 80000);

  assert.equal(detail.seller.id, owner.id);
  assert.equal(detail.seller.displayName, 'vendeur');
  assert.ok(!Number.isNaN(Date.parse(detail.seller.memberSince)));
  assert.equal(detail.seller.ratingAvg, null); // pas encore d'avis
  assert.equal(detail.seller.ratingCount, 0);
  assert.ok(detail.seller.activeAdsCount >= 1);
  assert.ok(!JSON.stringify(detail).includes(owner.email), "l'e-mail du vendeur ne doit jamais apparaître");

  assert.ok(['unknown', 'good_deal', 'fair', 'high'].includes(detail.priceHint));
});

test('un identifiant invalide donne 400, un identifiant inconnu donne 404', async () => {
  const invalid = await read('pas-un-uuid');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'VALIDATION');

  const unknown = await read('00000000-0000-4000-8000-000000000000');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.error.code, 'AD_NOT_FOUND');
});

for (const status of ['draft', 'archived']) {
  test(`une annonce « ${status} » est invisible pour un anonyme et un tiers (404), visible du propriétaire`, async () => {
    const ad = await postAd(owner, { title: `Annonce ${status} lecture` });
    await setStatus(ad.id, status);

    const anonymous = await read(ad.id);
    assert.equal(anonymous.status, 404);
    assert.equal(anonymous.body.error.code, 'AD_NOT_FOUND'); // 404 et non 403 : on ne révèle pas son existence
    assert.equal((await read(ad.id, visitor)).status, 404);

    const asOwner = await read(ad.id, owner);
    assert.equal(asOwner.status, 200);
    assert.equal(asOwner.body.data.status, status);
  });
}

test('un jeton invalide est traité comme un visiteur anonyme, pas comme une erreur', async () => {
  const ad = await postAd(owner, { title: 'Annonce jeton invalide' });
  const response = await request(app).get(`/api/ads/${ad.id}`).set({ Authorization: 'Bearer jeton-falsifie' });
  assert.equal(response.status, 200);
});

test('une annonce supprimée est introuvable pour tout le monde, propriétaire compris', async () => {
  const ad = await postAd(owner, { title: 'Annonce supprimée lecture' });
  assert.equal((await read(ad.id)).status, 200, 'lisible avant la suppression');
  await setStatus(ad.id, 'deleted');
  assert.equal((await read(ad.id)).status, 404);
  assert.equal((await read(ad.id, owner)).status, 404);
});

for (const status of ['reserved', 'sold']) {
  test(`une annonce « ${status} » reste publique`, async () => {
    const ad = await postAd(owner, { title: `Annonce ${status} lecture` });
    await setStatus(ad.id, status);
    const response = await read(ad.id);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.status, status);
  });
}

test('GET /api/users/me/ads : réservé aux connectés, hors annonces supprimées, filtrable par statut', async () => {
  const seller = await newUser('listeur');
  const active = await postAd(seller, { title: 'Liste active' });
  const sold = await postAd(seller, { title: 'Liste vendue' });
  const removed = await postAd(seller, { title: 'Liste supprimée' });
  await postPhotos(seller, active.id, 1);
  await setStatus(sold.id, 'sold');
  await setStatus(removed.id, 'deleted');

  assert.equal((await request(app).get('/api/users/me/ads')).status, 401);

  const all = await request(app).get('/api/users/me/ads').set(seller.auth);
  assert.equal(all.status, 200);
  assert.equal(all.body.meta.total, 2);
  assert.deepEqual(all.body.data.map((item) => item.title).sort(), ['Liste active', 'Liste vendue']);
  const activeItem = all.body.data.find((item) => item.id === active.id);
  assert.equal(activeItem.status, 'active');
  assert.equal(activeItem.priceCents, 850000);
  assert.ok(activeItem.coverUrl.endsWith('-thumb.webp'));

  const onlySold = await request(app).get('/api/users/me/ads').query({ status: 'sold' }).set(seller.auth);
  assert.deepEqual(onlySold.body.data.map((item) => item.id), [sold.id]);

  const paged = await request(app).get('/api/users/me/ads').query({ limit: 1, page: 2 }).set(seller.auth);
  assert.equal(paged.body.data.length, 1);
  assert.deepEqual(paged.body.meta, { total: 2, page: 2, limit: 1 });

  for (const bad of ['nimporte', 'deleted']) {
    const rejected = await request(app).get('/api/users/me/ads').query({ status: bad }).set(seller.auth);
    assert.equal(rejected.status, 400, `status=${bad}`);
  }
  // les annonces d'un autre utilisateur n'apparaissent jamais
  const others = await request(app).get('/api/users/me/ads').set(visitor.auth);
  assert.equal(others.body.meta.total, 0);
});
