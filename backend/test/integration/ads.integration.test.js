// Test d'intégration : nécessite PostgreSQL et MongoDB.
//   docker compose up -d --wait postgres mongo
//   docker compose exec backend npm run test:integration
import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import app from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { pool, query } from '../../src/config/postgres.js';
import { createAd } from '../../src/services/adService.js';
import { searchAds } from '../../src/repositories/adRepository.js';
import { AdDetails } from '../../src/models/AdDetails.js';

const email = `test-${Date.now()}@lebondeal.test`;
const otherEmail = `autre-${Date.now()}@lebondeal.test`;
const password = 'motdepasse-de-test';
let user;
let token;

const car = {
  title: 'Peugeot 208 diesel',
  description: 'Très bon état, entretien suivi, contrôle technique valide',
  priceCents: 850000,
  categorySlug: 'voitures',
  city: 'Lyon',
  postalCode: '69003',
  lat: 45.76,
  lng: 4.84,
  attributes: { marque: 'Peugeot', modele: '208', annee: 2019, kilometrage: 80000, carburant: 'Diesel' },
};

const countAds = async () => Number((await query('SELECT count(*) AS n FROM ads WHERE seller_id = $1', [user.id]))[0].n);

before(async () => {
  await connectDb(config.mongoUri);
});

after(async () => {
  // La suppression de l'utilisateur supprime ses annonces (ON DELETE CASCADE) ; on nettoie aussi MongoDB.
  const ids = (await query('SELECT id FROM ads WHERE seller_id = $1', [user?.id])).map((ad) => ad.id);
  const images = await query('SELECT url, thumb_url FROM ad_images WHERE ad_id = ANY($1::uuid[])', [ids]);
  for (const { url, thumbUrl } of images) {
    for (const publicUrl of [url, thumbUrl]) await rm(path.join(config.uploadDir, path.basename(publicUrl)), { force: true });
  }
  await AdDetails.deleteMany({ adId: { $in: ids } });
  await query('DELETE FROM users WHERE email = ANY($1::citext[])', [[email, otherEmail]]);
  await disconnectDb();
  await pool.end();
});

test('inscription, doublon, connexion, profil', async () => {
  const created = await request(app).post('/api/auth/register').send({ email, password, displayName: 'Testeur' });
  assert.equal(created.status, 201);
  user = created.body.data;

  const duplicate = await request(app).post('/api/auth/register').send({ email: email.toUpperCase(), password, displayName: 'Autre' });
  assert.equal(duplicate.status, 409); // e-mail déjà pris, même avec une casse différente

  const invalid = await request(app).post('/api/auth/register').send({ email: 'pas-un-email', password: 'court', displayName: 'X' });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'VALIDATION');

  const wrong = await request(app).post('/api/auth/login').send({ email, password: 'mauvais' });
  assert.equal(wrong.status, 401);
  const unknown = await request(app).post('/api/auth/login').send({ email: 'inconnu@lebondeal.test', password });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error.message, wrong.body.error.message); // ne révèle pas si le compte existe

  const login = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(login.status, 200);
  token = login.body.data.token;

  assert.equal((await request(app).get('/api/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/auth/me').set('Authorization', 'Bearer faux')).status, 401);
  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.data.email, email);
  assert.equal(me.body.data.passwordHash, undefined); // le hash ne sort jamais de l'API
});

test('créer une annonce écrit dans PostgreSQL ET dans MongoDB', async () => {
  const ad = await createAd(user.id, car);
  assert.equal(ad.priceCents, 850000);
  const details = await AdDetails.findOne({ adId: ad.id }).lean();
  assert.equal(details.attributes.carburant, 'Diesel');
});

test('un champ dynamique invalide est refusé et rien n\'est écrit', async () => {
  const before = await countAds();
  await assert.rejects(createAd(user.id, { ...car, attributes: { ...car.attributes, carburant: 'Vapeur' } }));
  await assert.rejects(createAd(user.id, { ...car, attributes: { ...car.attributes, champInconnu: 1 } }));
  assert.equal(await countAds(), before);
});

test('si MongoDB échoue, PostgreSQL annule l\'annonce (ROLLBACK)', async () => {
  const before = await countAds();
  const failing = mock.method(AdDetails, 'create', async () => { throw new Error('MongoDB indisponible'); });
  await assert.rejects(createAd(user.id, car), /MongoDB indisponible/);
  failing.mock.restore();
  assert.equal(await countAds(), before);
});

test('recherche : texte, catégorie parente, prix, champs dynamiques', async () => {
  const base = { sort: 'recent', page: 1, limit: 20 };

  const byText = await searchAds({ ...base, q: 'peugeot' });
  assert.ok(byText.items.some((item) => item.title === car.title));

  const byParent = await searchAds({ ...base, category: 'vehicules', q: 'peugeot' });
  assert.ok(byParent.total >= 1);

  const tooExpensive = await searchAds({ ...base, q: 'peugeot', priceMax: 100000 });
  assert.equal(tooExpensive.total, 0);

  const diesel = await searchAds({ ...base, category: 'voitures' }, { carburant: 'Diesel,Hybride', 'kilometrage.max': '100000' });
  assert.ok(diesel.items.some((item) => item.title === car.title));

  const essence = await searchAds({ ...base, category: 'voitures' }, { carburant: 'Essence' });
  assert.ok(!essence.items.some((item) => item.title === car.title));

  // Tentative d'injection d'opérateur Mongo : la valeur est traitée comme du texte, pas comme un opérateur
  const injection = await searchAds({ ...base, category: 'voitures' }, { carburant: { $ne: null } });
  assert.ok(!injection.items.some((item) => item.title === car.title));
});

test('parcours HTTP : catégories, dépôt, recherche, photos et droits d\'accès', async () => {
  const auth = { Authorization: `Bearer ${token}` };

  const tree = await request(app).get('/api/categories');
  assert.equal(tree.status, 200);
  assert.ok(tree.body.data.find((c) => c.slug === 'vehicules').children.some((c) => c.slug === 'voitures'));
  const schema = await request(app).get('/api/categories/voitures/schema');
  assert.ok(schema.body.data.fields.some((field) => field.key === 'carburant'));

  const clio = { ...car, title: 'Renault Clio testintegration', attributes: { ...car.attributes, marque: 'Renault', modele: 'Clio', carburant: 'Essence' } };
  assert.equal((await request(app).post('/api/ads').send(clio)).status, 401); // sans jeton
  assert.equal((await request(app).post('/api/ads').set(auth).send({ ...clio, priceCents: -5 })).status, 400);
  const created = await request(app).post('/api/ads').set(auth).send(clio);
  assert.equal(created.status, 201);
  const adId = created.body.data.id;

  // Recherche : texte + catégorie + filtre dynamique (?attr.carburant=Essence). Format { data, meta } en camelCase.
  const search = await request(app).get('/api/ads').query({ q: 'testintegration', category: 'voitures', 'attr.carburant': 'Essence' });
  assert.equal(search.status, 200);
  assert.equal(search.body.meta.total, 1);
  assert.equal(search.body.data[0].id, adId);
  assert.equal(search.body.data[0].priceCents, 850000);
  const noMatch = await request(app).get('/api/ads').query({ q: 'testintegration', category: 'voitures', 'attr.carburant': 'Diesel' });
  assert.equal(noMatch.body.meta.total, 0);
  assert.equal((await request(app).get('/api/ads').query({ limit: 500 })).status, 400);

  // Photos : le vendeur peut en ajouter, pas un autre utilisateur
  const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#ff6e14' } }).png().toBuffer();
  const attach = (req) => req.attach('photos', photo, { filename: 'photo.png', contentType: 'image/png' });
  const upload = await attach(request(app).post(`/api/ads/${adId}/images`).set(auth));
  assert.equal(upload.status, 201);
  const served = await request(app).get(upload.body.data[0].url);
  assert.equal(served.status, 200);
  assert.equal(served.headers['content-type'], 'image/webp');

  await request(app).post('/api/auth/register').send({ email: otherEmail, password, displayName: 'Autre' });
  const other = await request(app).post('/api/auth/login').send({ email: otherEmail, password });
  const forbidden = await attach(request(app).post(`/api/ads/${adId}/images`).set({ Authorization: `Bearer ${other.body.data.token}` }));
  assert.equal(forbidden.status, 403);

  // Favoris : idempotents, réservés aux utilisateurs connectés
  assert.equal((await request(app).get('/api/favorites/ids')).status, 401);
  assert.equal((await request(app).put(`/api/favorites/${adId}`).set(auth)).status, 204);
  assert.equal((await request(app).put(`/api/favorites/${adId}`).set(auth)).status, 204);
  assert.deepEqual((await request(app).get('/api/favorites/ids').set(auth)).body.data, [adId]);
  assert.equal((await request(app).put('/api/favorites/pas-un-uuid').set(auth)).status, 400);
  assert.equal((await request(app).delete(`/api/favorites/${adId}`).set(auth)).status, 204);
  assert.deepEqual((await request(app).get('/api/favorites/ids').set(auth)).body.data, []);
});
