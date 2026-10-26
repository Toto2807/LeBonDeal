// LeBonDeal : initialisation MongoDB (mongosh)
// Exécuté une seule fois, au PREMIER démarrage du volume mongodata.
// Variables fournies par compose : MONGO_APP_USER, MONGO_APP_PASSWORD.
//
// MongoDB stocke ce qui est flexible ou volumineux : champs propres à chaque catégorie,
// messagerie, notifications, événements. Les identités et les annonces restent dans PostgreSQL :
// ici, adId / userId / buyerId / sellerId sont des UUID PostgreSQL stockés en chaîne de caractères.

const appDb = db.getSiblingDB('lebondeal');
const DAY = 24 * 60 * 60; // secondes

// ─── category_schemas : définition des champs dynamiques de chaque catégorie ─
// Le frontend lit ces documents pour générer le formulaire de dépôt ET les filtres de recherche.
appDb.createCollection('category_schemas');
appDb.category_schemas.createIndex({ categorySlug: 1 }, { unique: true });

const field = (key, label, type, extra = {}) => ({ key, label, type, ...extra });
// type : 'text' | 'number' | 'select' | 'boolean' — filterable : apparaît dans le panneau de filtres
appDb.category_schemas.insertMany([
  {
    categorySlug: 'voitures',
    fields: [
      field('marque', 'Marque', 'select', { required: true, filterable: true,
        options: ['Peugeot', 'Renault', 'Citroën', 'Volkswagen', 'Toyota', 'BMW', 'Mercedes', 'Audi', 'Ford', 'Autre'] }),
      field('modele', 'Modèle', 'text', { required: true }),
      field('annee', 'Année', 'number', { required: true, filterable: true, min: 1950 }),
      field('kilometrage', 'Kilométrage', 'number', { required: true, filterable: true, unit: 'km', min: 0 }),
      field('carburant', 'Carburant', 'select', { required: true, filterable: true,
        options: ['Essence', 'Diesel', 'Hybride', 'Électrique', 'GPL'] }),
      field('boite', 'Boîte de vitesse', 'select', { filterable: true, options: ['Manuelle', 'Automatique'] }),
    ],
  },
  {
    categorySlug: 'motos',
    fields: [
      field('marque', 'Marque', 'text', { required: true, filterable: true }),
      field('cylindree', 'Cylindrée', 'number', { filterable: true, unit: 'cm³', min: 0 }),
      field('annee', 'Année', 'number', { filterable: true, min: 1950 }),
      field('kilometrage', 'Kilométrage', 'number', { filterable: true, unit: 'km', min: 0 }),
    ],
  },
  {
    categorySlug: 'velos',
    fields: [
      field('type', 'Type', 'select', { required: true, filterable: true,
        options: ['Ville', 'VTT', 'Route', 'Électrique', 'Enfant', 'Pliant'] }),
      field('taille', 'Taille du cadre', 'select', { options: ['XS', 'S', 'M', 'L', 'XL'] }),
      field('marque', 'Marque', 'text'),
    ],
  },
  {
    categorySlug: 'ventes-immobilieres',
    fields: [
      field('type_bien', 'Type de bien', 'select', { required: true, filterable: true,
        options: ['Appartement', 'Maison', 'Terrain', 'Parking', 'Local'] }),
      field('surface', 'Surface', 'number', { required: true, filterable: true, unit: 'm²', min: 1 }),
      field('pieces', 'Nombre de pièces', 'number', { filterable: true, min: 1 }),
      field('dpe', 'Diagnostic énergétique (DPE)', 'select', { filterable: true,
        options: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }),
    ],
  },
  {
    categorySlug: 'locations',
    fields: [
      field('type_bien', 'Type de bien', 'select', { required: true, filterable: true,
        options: ['Appartement', 'Maison', 'Studio', 'Chambre'] }),
      field('surface', 'Surface', 'number', { required: true, filterable: true, unit: 'm²', min: 1 }),
      field('pieces', 'Nombre de pièces', 'number', { filterable: true, min: 1 }),
      field('meuble', 'Meublé', 'boolean', { filterable: true }),
    ],
  },
  {
    categorySlug: 'informatique',
    fields: [
      field('type', 'Type', 'select', { required: true, filterable: true,
        options: ['Ordinateur portable', 'Ordinateur fixe', 'Écran', 'Composant', 'Périphérique', 'Tablette'] }),
      field('marque', 'Marque', 'text', { filterable: true }),
      field('ram', 'Mémoire vive', 'number', { unit: 'Go', min: 1 }),
      field('stockage', 'Stockage', 'number', { unit: 'Go', min: 1 }),
    ],
  },
  {
    categorySlug: 'telephones',
    fields: [
      field('marque', 'Marque', 'select', { required: true, filterable: true,
        options: ['Apple', 'Samsung', 'Xiaomi', 'Google', 'Huawei', 'Autre'] }),
      field('modele', 'Modèle', 'text', { required: true }),
      field('stockage', 'Stockage', 'number', { filterable: true, unit: 'Go', min: 1 }),
      field('debloque', 'Débloqué tout opérateur', 'boolean', { filterable: true }),
    ],
  },
  {
    categorySlug: 'vetements',
    fields: [
      field('taille', 'Taille', 'select', { required: true, filterable: true,
        options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] }),
      field('marque', 'Marque', 'text', { filterable: true }),
      field('couleur', 'Couleur', 'text', { filterable: true }),
      field('genre', 'Genre', 'select', { filterable: true, options: ['Femme', 'Homme', 'Mixte', 'Enfant'] }),
    ],
  },
  {
    categorySlug: 'chaussures',
    fields: [
      field('pointure', 'Pointure', 'number', { required: true, filterable: true, min: 16, max: 52 }),
      field('marque', 'Marque', 'text', { filterable: true }),
      field('genre', 'Genre', 'select', { filterable: true, options: ['Femme', 'Homme', 'Mixte', 'Enfant'] }),
    ],
  },
]);

// ─── ad_details : valeurs des champs dynamiques, une par annonce ─────────────
appDb.createCollection('ad_details', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['adId', 'categorySlug', 'attributes'],
    properties: {
      adId: { bsonType: 'string', description: 'UUID de ads.id dans PostgreSQL' },
      categorySlug: { bsonType: 'string' },
      attributes: { bsonType: 'object', description: 'ex. { marque: "Peugeot", kilometrage: 85000 }' },
    },
  } },
});
appDb.ad_details.createIndex({ adId: 1 }, { unique: true });
appDb.ad_details.createIndex({ categorySlug: 1 });
appDb.ad_details.createIndex({ 'attributes.$**': 1 }); // index « joker » : filtrer sur n'importe quel attribut

// ─── conversations : une par couple (annonce, acheteur) ──────────────────────
appDb.createCollection('conversations', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['adId', 'buyerId', 'sellerId', 'participants'],
    properties: {
      adId: { bsonType: 'string' },
      buyerId: { bsonType: 'string' },
      sellerId: { bsonType: 'string' },
      participants: { bsonType: 'array', minItems: 2, maxItems: 2, items: { bsonType: 'string' } },
      adSnapshot: { bsonType: 'object', description: 'titre, prix, photo au moment du contact' },
      lastMessage: { bsonType: 'object' },
      unread: { bsonType: 'object', description: 'compteur de non-lus par utilisateur : { "<userId>": 2 }' },
    },
  } },
});
appDb.conversations.createIndex({ adId: 1, buyerId: 1 }, { unique: true });
appDb.conversations.createIndex({ participants: 1, updatedAt: -1 }); // boîte de réception

// ─── messages : collection à part (pas de tableau qui grossit sans limite dans conversations) ─
appDb.createCollection('messages', {
  validator: { $jsonSchema: {
    bsonType: 'object',
    required: ['conversationId', 'senderId', 'type'],
    properties: {
      conversationId: { bsonType: 'objectId' },
      senderId: { bsonType: 'string' },
      type: { enum: ['text', 'offer', 'system'] },
      text: { bsonType: 'string', maxLength: 2000 },
      offer: { bsonType: 'object', properties: { amountCents: { bsonType: 'number' } } },
      readAt: { bsonType: ['date', 'null'] },
    },
  } },
});
appDb.messages.createIndex({ conversationId: 1, createdAt: -1 }); // pagination de l'historique

// ─── notifications (suppression automatique après 90 jours) ──────────────────
appDb.notifications.createIndex({ userId: 1, createdAt: -1 });
appDb.notifications.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * DAY });

// ─── saved_searches : recherches sauvegardées / alertes ──────────────────────
appDb.saved_searches.createIndex({ userId: 1, createdAt: -1 });

// ─── refresh_tokens : le document disparaît tout seul à expiresAt ────────────
appDb.refresh_tokens.createIndex({ tokenHash: 1 }, { unique: true });
appDb.refresh_tokens.createIndex({ userId: 1 });
appDb.refresh_tokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ─── Événements (statistiques, suppression automatique) ──────────────────────
appDb.ad_views.createIndex({ adId: 1, at: -1 });
appDb.ad_views.createIndex({ at: 1 }, { expireAfterSeconds: 180 * DAY });
appDb.search_events.createIndex({ q: 1, at: -1 });
appDb.search_events.createIndex({ at: 1 }, { expireAfterSeconds: 90 * DAY });

// ─── Utilisateur applicatif : créé EN DERNIER ────────────────────────────────
// Le healthcheck de compose se connecte avec cet utilisateur : il n'est « healthy »
// qu'une fois tout ce qui précède terminé.
appDb.createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: 'lebondeal' }],
});

print('LeBonDeal : MongoDB initialisé');
