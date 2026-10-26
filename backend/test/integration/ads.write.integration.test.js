// Modification, suppression et changement de statut d'une annonce — nécessite PostgreSQL et MongoDB.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app, request, query, setup, teardown, newUser, postAd, carAttributes } from './helpers.js';

let owner;
let other;
let buyer;

before(async () => {
  await setup();
  owner = await newUser('proprio');
  other = await newUser('intrus');
  buyer = await newUser('acheteur');
});
after(teardown);

const patch = (adId, user, body) => {
  const call = request(app).patch(`/api/ads/${adId}`);
  return (user ? call.set(user.auth) : call).send(body);
};
const remove = (adId, user) => {
  const call = request(app).delete(`/api/ads/${adId}`);
  return user ? call.set(user.auth) : call;
};
const changeStatus = (adId, user, body) => {
  const call = request(app).patch(`/api/ads/${adId}/status`);
  return (user ? call.set(user.auth) : call).send(body);
};
const detail = async (adId, user = owner) => (await request(app).get(`/api/ads/${adId}`).set(user.auth)).body.data;
const searchTotal = async (text) => (await request(app).get('/api/ads').query({ q: text })).body.meta.total;
const setStatus = (adId, status) => query('UPDATE ads SET status = $2::ad_status WHERE id = $1', [adId, status]);

// ── Modification ────────────────────────────────────────────────────────────

test('le propriétaire modifie son annonce ; la recherche suit le nouveau titre', async () => {
  const ad = await postAd(owner, { title: 'Gondolier ancien' });
  assert.equal(await searchTotal('gondolier'), 1);

  const response = await patch(ad.id, owner, { title: 'Zébulon nouveau', priceCents: 123456 });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.title, 'Zébulon nouveau');
  assert.equal(response.body.data.priceCents, 123456);
  assert.ok(Date.parse(response.body.data.updatedAt) > Date.parse(ad.createdAt), 'updatedAt a avancé');

  assert.equal(await searchTotal('zebulon'), 1, 'le nouveau titre est trouvé, sans accent');
  assert.equal(await searchTotal('gondolier'), 0, "l'ancien titre ne l'est plus");
});

test('les champs dynamiques se modifient ; un champ invalide annule toute la modification', async () => {
  const ad = await postAd(owner, { title: 'Annonce attributs ecriture' });

  const newAttributes = { ...carAttributes, marque: 'Renault', modele: 'Clio', carburant: 'Essence', kilometrage: 120000 };
  const ok = await patch(ad.id, owner, { attributes: newAttributes });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.attributes.carburant, 'Essence');
  assert.equal((await detail(ad.id)).attributes.kilometrage, 120000);

  // prix valide + carburant invalide dans la même requête : rien ne doit être modifié
  const bad = await patch(ad.id, owner, { priceCents: 99999, attributes: { ...newAttributes, carburant: 'Vapeur' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'VALIDATION');
  const after = await detail(ad.id);
  assert.equal(after.priceCents, 850000, 'le prix est resté celui d\'avant');
  assert.equal(after.attributes.carburant, 'Essence');
});

test('modification refusée : sans jeton, par un tiers, annonce inconnue, vendue, ou corps invalide', async () => {
  const ad = await postAd(owner, { title: 'Annonce protégée ecriture' });

  assert.equal((await patch(ad.id, null, { title: 'Piratage' })).status, 401);

  const intruder = await patch(ad.id, other, { title: 'Piratage' });
  assert.equal(intruder.status, 403);
  assert.equal(intruder.body.error.code, 'FORBIDDEN');
  assert.equal((await detail(ad.id)).title, 'Annonce protégée ecriture');

  const unknown = await patch('00000000-0000-4000-8000-000000000000', owner, { title: 'Fantôme' });
  assert.equal(unknown.status, 404);

  for (const body of [{}, { categorySlug: 'velos' }, { champInconnu: 1 }, { priceCents: -1 }, { lat: 45.7 }, { title: 'x' }]) {
    const rejected = await patch(ad.id, owner, body);
    assert.equal(rejected.status, 400, `corps ${JSON.stringify(body)}`);
  }

  await setStatus(ad.id, 'sold');
  const sold = await patch(ad.id, owner, { title: 'Trop tard' });
  assert.equal(sold.status, 409);
  assert.equal(sold.body.error.code, 'AD_NOT_EDITABLE');
});

test("une annonce cachée d'autrui répond 404, pas 403, aussi en écriture", async () => {
  const ad = await postAd(owner, { title: 'Brouillon caché ecriture' });
  await setStatus(ad.id, 'draft');
  assert.equal((await patch(ad.id, other, { title: 'Piratage' })).status, 404);
  assert.equal((await remove(ad.id, other)).status, 404);
  assert.equal((await changeStatus(ad.id, other, { status: 'active' })).status, 404);
  assert.equal((await patch(ad.id, owner, { title: 'Brouillon retouché' })).status, 200, 'le propriétaire peut, lui');
});

// ── Suppression ─────────────────────────────────────────────────────────────

test('le propriétaire supprime son annonce : elle disparaît de la fiche et de la recherche', async () => {
  const ad = await postAd(owner, { title: 'Marmotte supprimable' });
  assert.equal(await searchTotal('marmotte'), 1);

  assert.equal((await remove(ad.id, null)).status, 401);
  assert.equal((await remove(ad.id, other)).status, 403);
  assert.equal(await searchTotal('marmotte'), 1, "le tiers n'a rien supprimé");

  assert.equal((await remove(ad.id, owner)).status, 204);
  assert.equal((await request(app).get(`/api/ads/${ad.id}`)).status, 404);
  assert.equal((await request(app).get(`/api/ads/${ad.id}`).set(owner.auth)).status, 404);
  assert.equal(await searchTotal('marmotte'), 0);

  assert.equal((await remove(ad.id, owner)).status, 404, 'déjà supprimée');
  assert.equal((await remove('00000000-0000-4000-8000-000000000000', owner)).status, 404);
});

// ── Statut ──────────────────────────────────────────────────────────────────

test('réserver puis rouvrir ; archiver puis republier fait remonter la date de mise en ligne', async () => {
  const ad = await postAd(owner, { title: 'Annonce cycle statut' });

  assert.equal((await changeStatus(ad.id, owner, { status: 'reserved' })).body.data.status, 'reserved');
  assert.equal((await changeStatus(ad.id, owner, { status: 'active' })).body.data.status, 'active');

  const before = (await detail(ad.id)).publishedAt;
  const archived = await changeStatus(ad.id, owner, { status: 'archived' });
  assert.equal(archived.body.data.status, 'archived');
  assert.equal((await request(app).get(`/api/ads/${ad.id}`)).status, 404, 'une annonce archivée sort du public');

  const republished = await changeStatus(ad.id, owner, { status: 'active' });
  assert.equal(republished.body.data.status, 'active');
  assert.ok(Date.parse(republished.body.data.publishedAt) > Date.parse(before), 'publishedAt a avancé');
});

test('vendre avec un acheteur crée la vente ; la vente est définitive', async () => {
  const ad = await postAd(owner, { title: 'Annonce vendue statut', priceCents: 777700 });

  const sold = await changeStatus(ad.id, owner, { status: 'sold', buyerId: buyer.id });
  assert.equal(sold.status, 200);
  assert.equal(sold.body.data.status, 'sold');

  const sales = await query('SELECT seller_id, buyer_id, price_cents FROM transactions WHERE ad_id = $1', [ad.id]);
  assert.equal(sales.length, 1);
  assert.deepEqual(sales[0], { sellerId: owner.id, buyerId: buyer.id, priceCents: 777700 });

  for (const target of ['active', 'reserved', 'sold', 'archived']) {
    const refused = await changeStatus(ad.id, owner, { status: target });
    assert.equal(refused.status, 409, `sold → ${target}`);
    assert.equal(refused.body.error.code, 'INVALID_TRANSITION');
  }
  assert.equal((await query('SELECT count(*)::int AS n FROM transactions WHERE ad_id = $1', [ad.id]))[0].n, 1);
});

test('vendre sans acheteur est accepté et ne crée aucune vente', async () => {
  const ad = await postAd(owner, { title: 'Annonce vendue ailleurs' });
  const sold = await changeStatus(ad.id, owner, { status: 'sold' });
  assert.equal(sold.status, 200);
  assert.equal((await query('SELECT count(*)::int AS n FROM transactions WHERE ad_id = $1', [ad.id]))[0].n, 0);
});

test('acheteur invalide ou statut interdit : refusé et le statut ne bouge pas', async () => {
  const ad = await postAd(owner, { title: 'Annonce refus statut' });
  const unchanged = async () => assert.equal((await detail(ad.id)).status, 'active');

  const toSelf = await changeStatus(ad.id, owner, { status: 'sold', buyerId: owner.id });
  assert.equal(toSelf.status, 400);
  assert.equal(toSelf.body.error.code, 'INVALID_BUYER');
  await unchanged();

  const unknownBuyer = await changeStatus(ad.id, owner, { status: 'sold', buyerId: '00000000-0000-4000-8000-000000000000' });
  assert.equal(unknownBuyer.status, 400);
  assert.equal(unknownBuyer.body.error.code, 'INVALID_REFERENCE');
  await unchanged();

  for (const body of [{ status: 'deleted' }, { status: 'draft' }, { status: 'nimporte' }, { status: 'reserved', buyerId: buyer.id }, {}]) {
    assert.equal((await changeStatus(ad.id, owner, body)).status, 400, `corps ${JSON.stringify(body)}`);
  }
  assert.equal((await changeStatus(ad.id, null, { status: 'reserved' })).status, 401);
  assert.equal((await changeStatus(ad.id, other, { status: 'reserved' })).status, 403);
  await unchanged();
});

test('deux ventes simultanées : une seule aboutit, une seule ligne de vente', async () => {
  const ad = await postAd(owner, { title: 'Annonce double vente' });
  const second = await newUser('acheteur2');

  const results = await Promise.all([
    changeStatus(ad.id, owner, { status: 'sold', buyerId: buyer.id }),
    changeStatus(ad.id, owner, { status: 'sold', buyerId: second.id }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await query('SELECT count(*)::int AS n FROM transactions WHERE ad_id = $1', [ad.id]))[0].n, 1);
});
