// Aides communes aux tests d'intégration (PostgreSQL + MongoDB réels).
// Les utilisateurs sont créés par le service d'authentification et reçoivent un jeton signé directement :
// la route /api/auth/* est limitée à 20 requêtes par quart d'heure, ce qui rendrait la suite instable.
import { rm } from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import sharp from 'sharp';
import app from '../../src/app.js';
import { config } from '../../src/config/env.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { pool, query } from '../../src/config/postgres.js';
import { register } from '../../src/services/authService.js';
import { AdDetails } from '../../src/models/AdDetails.js';

export { app, query, request };

const createdEmails = [];
let counter = 0;

export const carAttributes = { marque: 'Peugeot', modele: '208', annee: 2019, kilometrage: 80000, carburant: 'Diesel' };

export const carBody = (overrides = {}) => ({
  title: 'Peugeot 208 phase1',
  description: 'Très bon état, entretien suivi, contrôle technique valide',
  priceCents: 850000,
  categorySlug: 'voitures',
  city: 'Lyon',
  postalCode: '69003',
  lat: 45.7612,
  lng: 4.8412,
  attributes: carAttributes,
  ...overrides,
});

export async function setup() {
  await connectDb(config.mongoUri);
}

export async function newUser(label = 'user') {
  const email = `${label}-${Date.now()}-${++counter}@lebondeal.test`;
  createdEmails.push(email);
  const user = await register({ email, password: 'motdepasse-de-test', displayName: label });
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '1h' });
  return { id: user.id, email, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function postAd(user, overrides) {
  const response = await request(app).post('/api/ads').set(user.auth).send(carBody(overrides));
  if (response.status !== 201) throw new Error(`création d'annonce échouée : ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
}

const COLORS = ['#ff6e14', '#1f2937', '#2563eb', '#16a34a'];

export async function postPhotos(user, adId, count = 3) {
  let upload = request(app).post(`/api/ads/${adId}/images`).set(user.auth);
  for (let index = 0; index < count; index++) {
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: COLORS[index % COLORS.length] } }).png().toBuffer();
    upload = upload.attach('photos', png, { filename: `photo-${index}.png`, contentType: 'image/png' });
  }
  const response = await upload;
  if (response.status !== 201) throw new Error(`envoi de photos échoué : ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
}

// Supprime tout ce que les tests ont créé : fichiers de photos, fiches Mongo, utilisateurs (la cascade SQL emporte le reste).
export async function teardown() {
  if (createdEmails.length > 0) {
    const files = await query(
      `SELECT i.url, i.thumb_url FROM ad_images i
       JOIN ads a ON a.id = i.ad_id JOIN users u ON u.id = a.seller_id
       WHERE u.email = ANY($1::citext[])`,
      [createdEmails]
    );
    for (const { url, thumbUrl } of files) {
      for (const publicUrl of [url, thumbUrl]) await rm(path.join(config.uploadDir, path.basename(publicUrl)), { force: true });
    }
    const ads = await query('SELECT a.id FROM ads a JOIN users u ON u.id = a.seller_id WHERE u.email = ANY($1::citext[])', [createdEmails]);
    await AdDetails.deleteMany({ adId: { $in: ads.map((ad) => ad.id) } });
    await query('DELETE FROM users WHERE email = ANY($1::citext[])', [createdEmails]);
  }
  await disconnectDb();
  await pool.end();
}
