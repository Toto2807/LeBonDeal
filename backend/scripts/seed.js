// Alimente PostgreSQL et MongoDB avec des données de démonstration réalistes.
//   docker compose exec backend npm run seed
// ⚠ Vide d'abord les utilisateurs, annonces, conversations… : développement uniquement.
// Compte de test : admin@lebondeal.test / password123 (tous les comptes générés ont le même mot de passe).
import bcrypt from 'bcryptjs';
import { fakerFR as faker } from '@faker-js/faker';
import { config, assertConfig } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { pool } from '../src/config/postgres.js';
import { AdDetails } from '../src/models/AdDetails.js';
import { CategorySchema } from '../src/models/CategorySchema.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';

if (process.env.NODE_ENV === 'production') throw new Error('Seed interdit en production');
assertConfig();
faker.seed(2026); // mêmes données à chaque exécution : pratique pour les démonstrations et les tests

// Grandes villes (nom, code postal, latitude, longitude)
const CITIES = [
  ['Paris', '75011', 48.859, 2.379], ['Lyon', '69003', 45.76, 4.86], ['Marseille', '13006', 43.289, 5.384],
  ['Toulouse', '31000', 43.604, 1.444], ['Nice', '06000', 43.703, 7.266], ['Nantes', '44000', 47.218, -1.553],
  ['Montpellier', '34000', 43.611, 3.877], ['Strasbourg', '67000', 48.573, 7.752], ['Bordeaux', '33000', 44.838, -0.579],
  ['Lille', '59000', 50.629, 3.057], ['Rennes', '35000', 48.117, -1.678], ['Reims', '51100', 49.258, 4.032],
  ['Grenoble', '38000', 45.188, 5.724], ['Dijon', '21000', 47.322, 5.041], ['Angers', '49000', 47.478, -0.563],
  ['Clermont-Ferrand', '63000', 45.777, 3.087], ['Tours', '37000', 47.394, 0.684], ['Rouen', '76000', 49.443, 1.099],
  ['Metz', '57000', 49.119, 6.176], ['Limoges', '87000', 45.834, 1.262],
];

// Catégories DummyJSON (https://dummyjson.com/products) -> sous-catégories LeBonDeal
const CATEGORY_MAP = {
  furniture: 'ameublement', 'home-decoration': 'ameublement', 'kitchen-accessories': 'electromenager',
  laptops: 'informatique', tablets: 'informatique', smartphones: 'telephones', 'mobile-accessories': 'telephones',
  'mens-shirts': 'vetements', tops: 'vetements', 'womens-dresses': 'vetements', 'mens-shoes': 'chaussures',
  'womens-shoes': 'chaussures', 'mens-watches': 'montres-bijoux', 'womens-watches': 'montres-bijoux',
  'womens-jewellery': 'montres-bijoux', 'womens-bags': 'sacs-accessoires', sunglasses: 'sacs-accessoires',
  'sports-accessories': 'sport', motorcycle: 'motos', vehicle: 'voitures',
};

// Catégories sans produit DummyJSON : annonces générées (photos picsum.photos)
const SYNTHETIC = {
  voitures: ['Peugeot 208', 'Renault Clio', 'Citroën C3', 'Volkswagen Golf', 'Toyota Yaris', 'Ford Fiesta'],
  velos: ['Vélo de ville', 'VTT Rockrider', 'Vélo électrique', 'Vélo de route', 'Vélo enfant'],
  locations: ['Appartement T2 lumineux', 'Studio meublé centre-ville', 'Maison avec jardin', 'Chambre chez l\'habitant'],
  'ventes-immobilieres': ['Appartement T3 rénové', 'Maison de ville', 'Studio investisseur', 'Appartement T4 balcon'],
};

const RANGES = { annee: [1995, 2024], kilometrage: [5000, 250000], surface: [12, 150], pieces: [1, 6],
                 cylindree: [50, 1200], ram: [4, 64], stockage: [64, 1024], pointure: [36, 46] };

const TEXT_VALUES = { marque: () => faker.vehicle.manufacturer(), modele: () => faker.vehicle.model(), couleur: () => faker.color.human() };

const pick = (list) => list[faker.number.int({ min: 0, max: list.length - 1 })];

// Génère des valeurs plausibles à partir de la définition des champs de la catégorie (collection category_schemas)
function attributesFor(fields) {
  const attributes = {};
  for (const field of fields) {
    if (!field.required && faker.number.int({ min: 0, max: 9 }) < 2) continue; // quelques champs facultatifs vides
    if (field.type === 'select') attributes[field.key] = pick(field.options);
    else if (field.type === 'boolean') attributes[field.key] = faker.datatype.boolean();
    else if (field.type === 'number') {
      const [min, max] = RANGES[field.key] ?? [field.min ?? 0, (field.min ?? 0) + 100];
      attributes[field.key] = faker.number.int({ min, max });
    } else attributes[field.key] = TEXT_VALUES[field.key]?.() ?? faker.commerce.productAdjective();
  }
  return attributes;
}

async function fetchProducts() {
  try {
    const response = await fetch('https://dummyjson.com/products?limit=0&select=title,description,price,category,images,thumbnail');
    const { products } = await response.json();
    return products.filter((product) => CATEGORY_MAP[product.category]);
  } catch {
    console.warn('DummyJSON injoignable : seulement des annonces générées.');
    return [];
  }
}

await connectDb(config.mongoUri);
const sql = (text, params) => pool.query(text, params).then((result) => result.rows);

console.log('Nettoyage…');
await sql('TRUNCATE users CASCADE'); // supprime aussi annonces, photos, favoris, ventes, avis, signalements
await Promise.all([AdDetails.deleteMany({}), Conversation.deleteMany({}), Message.deleteMany({})]);

// ── Utilisateurs ────────────────────────────────────────────────────────────
const passwordHash = await bcrypt.hash('password123', 10);
const users = [];
for (let i = 0; i < 30; i++) {
  const [city, postalCode] = pick(CITIES);
  const isAdmin = i === 0;
  const [user] = await sql(
    `INSERT INTO users (email, password_hash, display_name, city, postal_code, role, bio)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [isAdmin ? 'admin@lebondeal.test' : `user${i}@lebondeal.test`, passwordHash,
     isAdmin ? 'Admin' : faker.person.firstName(), city, postalCode, isAdmin ? 'admin' : 'user', faker.lorem.sentence()]
  );
  users.push(user.id);
}

// ── Annonces ────────────────────────────────────────────────────────────────
const categories = Object.fromEntries((await sql('SELECT id, slug FROM categories')).map((c) => [c.slug, c.id]));
const schemas = Object.fromEntries((await CategorySchema.find().lean()).map((s) => [s.categorySlug, s.fields]));
const CONDITIONS = ['new', 'like_new', 'good', 'good', 'fair'];

const drafts = (await fetchProducts()).map((product) => ({
  slug: CATEGORY_MAP[product.category], title: product.title, description: product.description,
  priceCents: Math.max(500, Math.round(product.price * 60 * faker.number.float({ min: 0.5, max: 1.1 }) / 500) * 500),
  images: product.images.slice(0, 5), thumb: product.thumbnail,
}));
for (const [slug, titles] of Object.entries(SYNTHETIC)) {
  const isImmo = slug.includes('immobilieres') || slug === 'locations';
  for (let i = 0; i < 15; i++) {
    const seed = `${slug}-${i}`;
    drafts.push({
      slug, title: pick(titles), description: faker.lorem.paragraph(),
      priceCents: isImmo ? (slug === 'locations' ? faker.number.int({ min: 350, max: 1500 }) * 100
                                                  : faker.number.int({ min: 90, max: 600 }) * 1000 * 100)
                         : faker.number.int({ min: slug === 'velos' ? 40 : 1500, max: slug === 'velos' ? 900 : 22000 }) * 100,
      images: [1, 2, 3].map((n) => `https://picsum.photos/seed/${seed}-${n}/800/600`),
      thumb: `https://picsum.photos/seed/${seed}-1/400/300`,
    });
  }
}

const ads = [];
for (const draft of faker.helpers.shuffle(drafts)) {
  const [city, postalCode, lat, lng] = pick(CITIES);
  const status = faker.number.int({ min: 0, max: 9 }) === 0 ? 'sold' : 'active';
  const sellerId = pick(users);
  const [ad] = await sql(
    `INSERT INTO ads (seller_id, category_id, title, description, price_cents, item_condition, status,
                      city, postal_code, lat, lng, shipping_available, published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now() - make_interval(days => $13))
     RETURNING id`,
    [sellerId, categories[draft.slug], draft.title.slice(0, 120), draft.description, draft.priceCents, pick(CONDITIONS),
     status, city, postalCode, lat + faker.number.float({ min: -0.03, max: 0.03 }), lng + faker.number.float({ min: -0.03, max: 0.03 }),
     faker.datatype.boolean(), faker.number.int({ min: 0, max: 55 })]
  );
  for (const [position, url] of draft.images.entries()) {
    await sql('INSERT INTO ad_images (ad_id, url, thumb_url, position) VALUES ($1, $2, $3, $4)',
      [ad.id, url, position === 0 ? draft.thumb : url, position]);
  }
  if (schemas[draft.slug]) {
    await AdDetails.create({ adId: ad.id, categorySlug: draft.slug, attributes: attributesFor(schemas[draft.slug]) });
  }
  ads.push({ id: ad.id, sellerId, status, title: draft.title, priceCents: draft.priceCents, thumb: draft.thumb });
}

// ── Favoris ─────────────────────────────────────────────────────────────────
for (const userId of users) {
  for (const ad of faker.helpers.arrayElements(ads, 8)) {
    await sql('INSERT INTO favorites (user_id, ad_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, ad.id]);
  }
}

// ── Conversations et messages (MongoDB) ─────────────────────────────────────
let messageCount = 0;
for (const ad of faker.helpers.arrayElements(ads.filter((a) => a.status === 'active'), 40)) {
  const buyerId = pick(users.filter((id) => id !== ad.sellerId));
  const turns = faker.number.int({ min: 2, max: 6 });
  const start = Date.now() - faker.number.int({ min: 1, max: 20 }) * 86_400_000;
  const conversation = await Conversation.create({
    adId: ad.id, buyerId, sellerId: ad.sellerId, participants: [buyerId, ad.sellerId],
    adSnapshot: { title: ad.title, priceCents: ad.priceCents, coverUrl: ad.thumb },
  });
  let last;
  for (let i = 0; i < turns; i++) {
    const senderId = i % 2 === 0 ? buyerId : ad.sellerId;
    last = await Message.create({
      conversationId: conversation._id, senderId, type: 'text', createdAt: new Date(start + i * 3_600_000),
      text: i === 0 ? 'Bonjour, est-ce toujours disponible ?' : faker.lorem.sentence(),
      readAt: i < turns - 1 ? new Date(start + (i + 1) * 3_600_000) : null,
    });
    messageCount++;
  }
  await Conversation.updateOne({ _id: conversation._id }, {
    $set: { lastMessage: { text: last.text, senderId: last.senderId, at: last.createdAt }, updatedAt: last.createdAt,
            [`unread.${last.senderId === buyerId ? ad.sellerId : buyerId}`]: 1 },
  });
}

// ── Ventes et avis ──────────────────────────────────────────────────────────
let reviewCount = 0;
for (const ad of ads.filter((a) => a.status === 'sold')) {
  const buyerId = pick(users.filter((id) => id !== ad.sellerId));
  const [sale] = await sql(
    'INSERT INTO transactions (ad_id, seller_id, buyer_id, price_cents) VALUES ($1, $2, $3, $4) RETURNING id',
    [ad.id, ad.sellerId, buyerId, ad.priceCents]
  );
  for (const [reviewer, reviewee] of [[buyerId, ad.sellerId], [ad.sellerId, buyerId]]) {
    if (faker.number.int({ min: 0, max: 3 }) === 0) continue; // tout le monde ne laisse pas d'avis
    await sql('INSERT INTO reviews (transaction_id, reviewer_id, reviewee_id, rating, comment) VALUES ($1, $2, $3, $4, $5)',
      [sale.id, reviewer, reviewee, faker.number.int({ min: 3, max: 5 }), faker.lorem.sentence()]);
    reviewCount++;
  }
}

const [{ n: adCount }] = await sql('SELECT count(*) AS n FROM ads');
console.log(`Terminé : ${users.length} utilisateurs, ${adCount} annonces, ${messageCount} messages, ${reviewCount} avis.`);
await disconnectDb();
await pool.end();
