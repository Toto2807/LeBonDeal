# LeBonDeal — Base NoSQL (MongoDB)

> Partie 3/5 du dossier de conception. Vue d'ensemble : [`2026-10-26-lebondeal-design.md`](../superpowers/specs/2026-10-26-lebondeal-design.md). Compagnon : [02 — PostgreSQL](02-postgresql.md).
> Le script d'initialisation, les modèles et les requêtes de ce document ont été exécutés sur MongoDB 8 (voir § 10).

## 1. Pourquoi MongoDB, et ce qui y vit

MongoDB reçoit ce qui est **flexible, volumineux, ou écrit sans arrêt**, et où les contraintes relationnelles n'apportent rien.

| Donnée | Collection | Pourquoi dans MongoDB |
|---|---|---|
| Définition des champs de chaque catégorie | `category_schemas` | une voiture a un kilométrage, un logement une surface : le schéma varie, et il pilote le formulaire **et** les filtres du site |
| Valeurs de ces champs pour chaque annonce | `ad_details` | documents de forme différente selon la catégorie, sans colonnes vides ni tables par catégorie |
| Conversations et messages | `conversations`, `messages` | écriture intensive, jamais modifiés, lus par pages |
| Notifications | `notifications` | volumétrie, expirent seules (index TTL) |
| Recherches sauvegardées | `saved_searches` | un filtre est un document libre |
| Jetons de rafraîchissement | `refresh_tokens` | expirent seuls |
| Événements de vues et de recherches | `ad_views`, `search_events` | statistiques par agrégation, expirent seuls |

**Règle d'or.** *Une donnée a un seul foyer.* L'identité d'un utilisateur et l'existence d'une annonce sont dans PostgreSQL ; MongoDB ne fait que **référencer** leur `uuid` (en chaîne de caractères) : `adId`, `buyerId`, `sellerId`. Il n'y a pas de clé étrangère entre les deux bases, donc la cohérence est assurée par le code (§ 7).

Première phase (MVP) : `category_schemas`, `ad_details`, `conversations`, `messages`. Les autres collections sont créées dès le départ (index compris) mais utilisées plus tard.

## 2. Modéliser : intégrer ou référencer ?

C'est LA question de modélisation MongoDB, et elle mérite un paragraphe dans votre rapport. Les choix faits ici :

- **Les messages sont dans leur propre collection**, pas dans un tableau de la conversation. Un tableau qui grossit sans limite finit par atteindre la taille maximale d'un document (16 Mo), ralentit chaque mise à jour et empêche de paginer. En collection séparée avec l'index `{ conversationId, createdAt }`, charger « les 30 derniers messages » est une requête simple.
- **Un aperçu est intégré dans la conversation** (`adSnapshot`, `lastMessage`, `unread`) : la boîte de réception s'affiche avec **une seule** requête, sans consulter PostgreSQL ni la collection des messages. On accepte que l'aperçu soit une copie figée (le titre de l'annonce au moment du contact) : pour une conversation, c'est même ce qu'on veut.
- **`participants: [buyerId, sellerId]`** duplique deux champs, mais permet « mes conversations » avec un seul index (`{ participants, updatedAt }`) quel que soit le rôle de l'utilisateur.
- **`unread` est un objet** `{ "<userId>": 2 }` mis à jour avec `$inc` : incrément atomique, sans lire d'abord.
- **`ad_details.attributes` est un objet libre**, validé par l'application (§ 6) d'après `category_schemas`, et indexé par un **index joker** `attributes.$**` pour pouvoir filtrer sur n'importe quel champ.

## 3. Forme des documents

```jsonc
// category_schemas — lu par le frontend pour fabriquer formulaire et filtres
{ "categorySlug": "voitures",
  "fields": [
    { "key": "carburant", "label": "Carburant", "type": "select", "required": true, "filterable": true,
      "options": ["Essence", "Diesel", "Hybride", "Électrique", "GPL"] },
    { "key": "kilometrage", "label": "Kilométrage", "type": "number", "unit": "km", "min": 0, "filterable": true } ] }

// ad_details — une par annonce PostgreSQL
{ "adId": "6113b9fa-e3c5-4269-b650-a8b127bf1e07", "categorySlug": "voitures",
  "attributes": { "marque": "Peugeot", "modele": "208", "annee": 2019, "kilometrage": 80000, "carburant": "Diesel" } }

// conversations — une par couple (annonce, acheteur)
{ "adId": "…", "buyerId": "…", "sellerId": "…", "participants": ["<buyerId>", "<sellerId>"],
  "adSnapshot": { "title": "Peugeot 208", "priceCents": 900000, "coverUrl": "…" },
  "lastMessage": { "text": "Bonjour…", "senderId": "…", "at": "2026-10-11T17:14:33Z" },
  "unread": { "<sellerId>": 1 } }

// messages
{ "conversationId": ObjectId("…"), "senderId": "…", "type": "text",       // 'text' | 'offer' | 'system'
  "text": "Bonjour, est-ce toujours disponible ?", "readAt": null, "createdAt": ISODate("…") }
// une offre de prix est un message : { type: "offer", offer: { amountCents: 85000 } }
```

Autres collections, créées avec leurs index : `notifications` (`userId`, `type`, `payload`, `readAt`), `saved_searches` (`userId`, `name`, `query`, `notify`), `refresh_tokens` (`userId`, `tokenHash`, `expiresAt`), `ad_views` (`adId`, `sessionId`, `at`), `search_events` (`q`, `filters`, `at`).

## 4. Le script d'initialisation

Il crée les collections avec **validation côté base** (`$jsonSchema`), les index (dont les TTL et l'index joker), les définitions de catégories, puis l'utilisateur applicatif. Il s'exécute une fois, au premier démarrage du volume.

> **L'utilisateur est créé en dernier, volontairement** : le healthcheck de `compose.yaml` s'y connecte, donc le service n'est déclaré prêt qu'une fois tout le reste en place.
> Un mot de passe est lu depuis l'environnement (`process.env.MONGO_APP_PASSWORD`), jamais écrit dans le fichier. Vérifié : cela fonctionne dans `mongosh` pour les scripts d'initialisation.

**`database/mongo/init/01-init.js`**

```js
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
```
À retenir sur les index :

- **TTL** (`expireAfterSeconds`) : MongoDB supprime lui-même les documents expirés (un passage par minute environ). `notifications` 90 jours, `ad_views` 180 jours, `search_events` 90 jours, `refresh_tokens` à la date contenue dans `expiresAt` (`expireAfterSeconds: 0`).
- **Unique composé** `{ adId, buyerId }` sur `conversations` : impossible d'ouvrir deux conversations pour la même annonce avec le même acheteur, même si deux clics arrivent en même temps (vérifié : refusé avec `E11000`).
- **Index joker** `{ 'attributes.$**': 1 }` : `find({ 'attributes.marque': 'Peugeot' })` utilise l'index (vérifié avec `explain` : `IXSCAN`) alors qu'on n'a déclaré aucun champ à l'avance.
- Les validateurs refusent : un message de type inconnu, sans expéditeur ou de plus de 2000 caractères ; une conversation à 3 participants ; une fiche `ad_details` sans `attributes`. Vérifié un par un.

## 5. Les modèles Mongoose

Mongoose reste utilisé (comme dans le starter) pour les modèles, mais **les index et validateurs sont créés par le script, pas par Mongoose** : `autoIndex` et `autoCreate` sont désactivés dans `db.js` (document 05). Une seule source de vérité.

Trois pièges, déjà évités dans le code ci-dessous :

1. **Nom de collection.** Mongoose met le nom du modèle au pluriel en minuscules : `AdDetails` deviendrait `addetails`. Chaque modèle fixe donc `collection: '…'` (comportement documenté de Mongoose, non reproduit ici).
2. **`minimize: false`.** Par défaut Mongoose *supprime les objets vides* avant l'enregistrement. Une annonce sans champ dynamique (catégorie « Sport » par exemple) aurait `attributes: {}` supprimé, et le validateur de la base, qui exige `attributes`, la refuserait. **Reproduit et vérifié** : le même modèle sans `minimize: false` est refusé (« Document failed validation »), le modèle livré accepte.
3. **`require` ou `required` ?** Le starter écrit `require: true` (`models/User.js`) : cette faute de frappe désactive silencieusement la validation. C'est `required`.

**`backend/src/models/AdDetails.js`**

```js
import mongoose from 'mongoose';

const adDetailsSchema = new mongoose.Schema(
  {
    adId: { type: String, required: true },            // UUID de ads.id dans PostgreSQL
    categorySlug: { type: String, required: true },
    attributes: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
  },
  {
    timestamps: true,
    collection: 'ad_details', // nom explicite : sinon Mongoose pluralise en « addetails »
    minimize: false,          // sinon Mongoose retire un objet vide, et le validateur de la base exige « attributes »
  }
);

export const AdDetails = mongoose.model('AdDetails', adDetailsSchema);
```
**`backend/src/models/CategorySchema.js`**

```js
import mongoose from 'mongoose';

// Définition des champs dynamiques d'une catégorie (lecture seule côté application).
const categorySchemaSchema = new mongoose.Schema(
  {
    categorySlug: { type: String, required: true },
    fields: [mongoose.Schema.Types.Mixed], // { key, label, type, required, filterable, options, unit, min, max }
  },
  { collection: 'category_schemas' }
);

export const CategorySchema = mongoose.model('CategorySchema', categorySchemaSchema);
```
**`backend/src/models/Conversation.js`**

```js
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    adId: { type: String, required: true },
    buyerId: { type: String, required: true },
    sellerId: { type: String, required: true },
    participants: { type: [String], required: true },     // [buyerId, sellerId] : permet « mes conversations » en une requête
    adSnapshot: { title: String, priceCents: Number, coverUrl: String }, // copie figée : la liste s'affiche sans appeler PostgreSQL
    lastMessage: { text: String, senderId: String, at: Date },
    unread: { type: Map, of: Number, default: {} },        // { "<userId>": nombre de messages non lus }
  },
  { timestamps: true, collection: 'conversations', minimize: false }
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
```
**`backend/src/models/Message.js`**

```js
import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    senderId: { type: String, required: true },
    type: { type: String, enum: ['text', 'offer', 'system'], default: 'text' },
    text: { type: String, maxlength: 2000 },
    offer: { amountCents: Number },                        // présent quand type = 'offer'
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'messages' }
);

export const Message = mongoose.model('Message', messageSchema);
```
## 6. Valider et filtrer les champs dynamiques

Deux fonctions transforment la définition d'une catégorie en règles :

- `buildAttributesSchema(fields)` construit un schéma **zod** pour valider un dépôt d'annonce : un champ inconnu, un nombre sous le minimum ou une valeur hors liste est refusé (le client n'est jamais cru).
- `buildAttributesFilter(fields, raw)` transforme les paramètres de recherche `?attr.…` en filtre MongoDB. **Sécurité** : seuls les champs `filterable` de la catégorie sont pris, et chaque valeur est convertie en texte, nombre ou booléen. Un client ne peut pas envoyer `{ "$ne": null }` comme valeur de filtre (testé : l'injection est traitée comme du texte, sans résultat).

**`backend/src/utils/attributes.js`**

```js
import { z } from 'zod';

// Construit le schéma de validation des champs dynamiques d'une catégorie
// à partir du document de la collection category_schemas (MongoDB).
// Le client n'est jamais cru : un champ inconnu ou une valeur hors liste est refusé.
export function buildAttributesSchema(fields) {
  const shape = {};
  for (const field of fields) {
    let rule;
    if (field.type === 'number') {
      rule = z.number();
      if (field.min != null) rule = rule.min(field.min);
      if (field.max != null) rule = rule.max(field.max);
    } else if (field.type === 'boolean') {
      rule = z.boolean();
    } else if (field.type === 'select') {
      rule = z.enum(field.options);
    } else {
      rule = z.string().trim().max(120);
    }
    shape[field.key] = field.required ? rule : rule.optional();
  }
  return z.strictObject(shape);
}

// Transforme les paramètres de recherche ?attr.* en filtre MongoDB.
// raw : { carburant: 'Diesel,Hybride', 'kilometrage.max': '100000', meuble: 'true' }
// Seuls les champs `filterable` de la catégorie sont pris en compte et chaque valeur est convertie en type simple
// (texte, nombre, booléen) : un client ne peut pas injecter d'opérateur Mongo comme { "$ne": null }.
export function buildAttributesFilter(fields, raw) {
  const filter = {};
  for (const field of fields.filter((f) => f.filterable)) {
    const path = `attributes.${field.key}`;
    if (field.type === 'number') {
      const range = {};
      const min = Number(raw[`${field.key}.min`]);
      const max = Number(raw[`${field.key}.max`]);
      if (raw[`${field.key}.min`] != null && !Number.isNaN(min)) range.$gte = min;
      if (raw[`${field.key}.max`] != null && !Number.isNaN(max)) range.$lte = max;
      if (Object.keys(range).length > 0) filter[path] = range;
    } else if (field.type === 'boolean' && raw[field.key] != null) {
      filter[path] = String(raw[field.key]) === 'true';
    } else if (field.type === 'select' && raw[field.key]) {
      filter[path] = { $in: String(raw[field.key]).split(',') };
    } else if (field.type === 'text' && raw[field.key]) {
      filter[path] = String(raw[field.key]);
    }
  }
  return filter;
}
```
Format des paramètres de recherche, tel que l'utilise le panneau de filtres du frontend :

| Type de champ | Dans l'URL |
|---|---|
| `select` | `?attr.carburant=Diesel,Hybride` (plusieurs valeurs séparées par une virgule = « l'un ou l'autre ») |
| `number` | `?attr.kilometrage.max=100000` et/ou `?attr.annee.min=2015` |
| `boolean` | `?attr.meuble=true` |
| `text` | `?attr.marque=Peugeot` |

## 7. Garder PostgreSQL et MongoDB cohérents

Il n'existe pas de transaction qui couvre deux bases différentes. Les règles :

**Création d'une annonce.** On écrit dans PostgreSQL *dans une transaction*, on écrit les détails dans MongoDB *avant le `COMMIT`*, et si MongoDB échoue l'exception annule la transaction PostgreSQL. Testé : avec une écriture Mongo qui échoue volontairement, le nombre d'annonces en SQL ne bouge pas.

Cas rare qui reste : MongoDB réussit puis le `COMMIT` SQL échoue → un document orphelin dans `ad_details`. Inoffensif (personne ne le lit) ; une tâche de réconciliation en phase 4 le supprimera (« les `adId` de Mongo absents de PostgreSQL »). Les ajouts de photos, eux, ne concernent que PostgreSQL.

**`backend/src/services/adService.js`**

```js
import { config } from '../config/env.js';
import { query, withTransaction, camelize } from '../config/postgres.js';
import { AdDetails } from '../models/AdDetails.js';
import { CategorySchema } from '../models/CategorySchema.js';
import { saveAdImage } from './imageService.js';
import { buildAttributesSchema } from '../utils/attributes.js';
import { HttpError } from '../utils/HttpError.js';

// `input` a déjà été validé par createAdSchema (voir le contrôleur).
export async function createAd(sellerId, input) {
  const { attributes = {}, categorySlug, ...ad } = input;

  const [category] = await query('SELECT id FROM categories WHERE slug = $1 AND parent_id IS NOT NULL', [categorySlug]);
  if (!category) throw new HttpError(400, 'CATEGORY_INVALID', 'Catégorie inconnue');

  // Champs dynamiques : validés contre la définition de la catégorie stockée dans MongoDB.
  const definition = await CategorySchema.findOne({ categorySlug }).lean();
  const cleanAttributes = buildAttributesSchema(definition?.fields ?? []).parse(attributes);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO ads (seller_id, category_id, title, description, price_cents, item_condition,
                        city, postal_code, lat, lng, shipping_available)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [sellerId, category.id, ad.title, ad.description, ad.priceCents, ad.itemCondition ?? null,
       ad.city, ad.postalCode, ad.lat ?? null, ad.lng ?? null, ad.shippingAvailable ?? false]
    );
    // Si l'écriture MongoDB échoue, l'exception remonte et PostgreSQL annule l'INSERT (ROLLBACK).
    // Cas rare restant : MongoDB réussit puis le COMMIT échoue -> un document orphelin (tâche de réconciliation en phase 4).
    await AdDetails.create({ adId: rows[0].id, categorySlug, attributes: cleanAttributes });
    return camelize(rows[0]);
  });
}

// Ajoute des photos à une annonce dont l'utilisateur est le vendeur. `files` vient de multer (req.files).
export async function addImages(userId, adId, files) {
  const [ad] = await query('SELECT seller_id FROM ads WHERE id = $1 AND deleted_at IS NULL', [adId]);
  if (!ad) throw new HttpError(404, 'AD_NOT_FOUND', 'Annonce introuvable');
  if (ad.sellerId !== userId) throw new HttpError(403, 'FORBIDDEN', "Cette annonce n'est pas la vôtre");
  if (files.length === 0) throw new HttpError(400, 'NO_FILE', 'Aucune photo reçue');

  const [{ n: existing }] = await query('SELECT count(*)::int AS n FROM ad_images WHERE ad_id = $1', [adId]);
  if (existing + files.length > 10) throw new HttpError(400, 'TOO_MANY_IMAGES', '10 photos maximum par annonce');

  const saved = [];
  for (const [index, file] of files.entries()) {
    const { url, thumbUrl } = await saveAdImage(file.buffer, config.uploadDir);
    const [image] = await query(
      `INSERT INTO ad_images (ad_id, url, thumb_url, position) VALUES ($1, $2, $3, $4)
       RETURNING id, url, thumb_url, position`,
      [adId, url, thumbUrl, existing + index]
    );
    saved.push(image);
  }
  return saved;
}
```
**Recherche avec filtres dynamiques, en deux temps.** Les filtres communs (texte, prix, rayon, catégorie) sont dans PostgreSQL, les filtres dynamiques dans MongoDB. On interroge donc d'abord MongoDB (qui renvoie une liste d'identifiants), puis PostgreSQL applique tout le reste avec `id = ANY(liste)`. La requête SQL du document 02 accepte déjà cette liste en `$10`.

**`backend/src/repositories/adRepository.js`**

```js
import { readFileSync } from 'node:fs';
import { query } from '../config/postgres.js';
import { AdDetails } from '../models/AdDetails.js';
import { CategorySchema } from '../models/CategorySchema.js';
import { buildAttributesFilter } from '../utils/attributes.js';

const SEARCH_SQL = readFileSync(new URL('../sql/search-ads.sql', import.meta.url), 'utf8');

// Liste blanche : le tri demandé par le client ne finit jamais tel quel dans la requête SQL.
const SORTS = {
  recent: 'v.published_at DESC',
  price_asc: 'v.price_cents ASC',
  price_desc: 'v.price_cents DESC',
  distance: 'distance_km ASC NULLS LAST',
};

// filters : résultat de searchQuerySchema.parse(req.query)
// rawAttributes : { carburant: 'Diesel,Hybride', 'kilometrage.max': '100000' } (issu des paramètres ?attr.*)
export async function searchAds(filters, rawAttributes = {}) {
  const { q, category, priceMin, priceMax, lat, lng, radiusKm, sort, page, limit } = filters;

  // Étape 1 : filtres sur les champs dynamiques -> MongoDB renvoie les identifiants d'annonces compatibles.
  let allowedIds = null;
  if (category && Object.keys(rawAttributes).length > 0) {
    const definition = await CategorySchema.findOne({ categorySlug: category }).lean();
    const mongoFilter = buildAttributesFilter(definition?.fields ?? [], rawAttributes);
    if (Object.keys(mongoFilter).length > 0) {
      const docs = await AdDetails.find({ categorySlug: category, ...mongoFilter }, { adId: 1, _id: 0 }).limit(1000).lean();
      allowedIds = docs.map((doc) => doc.adId);
      if (allowedIds.length === 0) return { items: [], total: 0 };
    }
  }

  // Étape 2 : PostgreSQL applique tous les autres filtres, le tri et la pagination.
  const sql = SEARCH_SQL.replace('ORDER BY v.published_at DESC', `ORDER BY ${SORTS[sort]}`);
  const rows = await query(sql, [
    q ?? null, category ?? null, priceMin ?? null, priceMax ?? null,
    lat ?? null, lng ?? null, radiusKm ? radiusKm * 1000 : null,
    limit, (page - 1) * limit, allowedIds,
  ]);
  return { items: rows.map(({ total, ...ad }) => ad), total: Number(rows[0]?.total ?? 0) };
}
```
> **Limite connue de ce choix.** La liste d'identifiants venue de Mongo est plafonnée à 1000 : au-delà, des résultats peuvent manquer. À l'échelle d'un projet étudiant ce n'est pas un problème. La solution de remplacement, à discuter dans le rapport, est de mettre les attributs dans une colonne `jsonb` PostgreSQL (requête unique, mais on n'utiliserait plus MongoDB pour cela).

**Suppression.** Supprimer un utilisateur ou une annonce en SQL **ne supprime pas** les documents Mongo liés. À faire dans le service de suppression : supprimer d'abord les documents Mongo (`ad_details`, `ad_views`, conversations de l'annonce) puis la ligne SQL, ou, plus simple, ne jamais supprimer vraiment une annonce (statut `deleted`) et garder le nettoyage Mongo pour la réconciliation.

## 8. Requêtes types

Fichier de référence pour `mongosh` (et pour écrire les services de messagerie et de statistiques). Chaque requête a été exécutée sur des données de test.

**`database/mongo/examples.js`**

```js
// Requêtes MongoDB types de LeBonDeal (mongosh, base « lebondeal »).
// Les identifiants sont des UUID PostgreSQL (chaînes), sauf conversationId qui est un ObjectId MongoDB.

const buyerId = '00000000-0000-0000-0000-0000000000b1';
const sellerId = '00000000-0000-0000-0000-0000000000a1';
const adId = '11111111-1111-1111-1111-111111111111';

// ── 1. Messagerie ────────────────────────────────────────────────────────────
// Ouvrir (ou retrouver) la conversation acheteur ↔ annonce : l'index unique { adId, buyerId } évite les doublons.
const conv = db.conversations.findOneAndUpdate(
  { adId, buyerId },
  { $setOnInsert: { adId, buyerId, sellerId, participants: [buyerId, sellerId],
                    adSnapshot: { title: 'Peugeot 208', priceCents: 900000 }, unread: {}, createdAt: new Date() } },
  { upsert: true, returnDocument: 'after' }
);

// Envoyer un message : on l'insère, puis on met à jour l'aperçu et le compteur de non-lus du destinataire.
const now = new Date();
db.messages.insertOne({ conversationId: conv._id, senderId: buyerId, type: 'text',
                        text: 'Bonjour, est-ce toujours disponible ?', readAt: null, createdAt: now });
db.conversations.updateOne({ _id: conv._id }, {
  $set: { lastMessage: { text: 'Bonjour, est-ce toujours disponible ?', senderId: buyerId, at: now }, updatedAt: now },
  $inc: { [`unread.${sellerId}`]: 1 },
});

// Boîte de réception d'un utilisateur : ses conversations, les plus récentes d'abord.
db.conversations.find({ participants: sellerId }).sort({ updatedAt: -1 }).limit(20).toArray();

// Historique d'une conversation, 30 messages à la fois (« charger plus » : passer le createdAt du plus ancien dans `before`).
const before = new Date();
db.messages.find({ conversationId: conv._id, createdAt: { $lt: before } }).sort({ createdAt: -1 }).limit(30).toArray();

// Marquer comme lus : les messages de l'autre personne + le compteur de non-lus de l'utilisateur.
db.messages.updateMany({ conversationId: conv._id, senderId: { $ne: sellerId }, readAt: null }, { $set: { readAt: new Date() } });
db.conversations.updateOne({ _id: conv._id }, { $set: { [`unread.${sellerId}`]: 0 } });

// ── 2. Champs dynamiques par catégorie ───────────────────────────────────────
// Formulaire et filtres du frontend : la définition des champs d'une catégorie.
db.category_schemas.findOne({ categorySlug: 'voitures' });

// Filtre de recherche : voitures diesel ou hybrides, moins de 100 000 km.
// Résultat = liste d'identifiants, à passer à PostgreSQL (WHERE id = ANY($1::uuid[])) avec les autres filtres.
db.ad_details.find(
  { categorySlug: 'voitures', 'attributes.carburant': { $in: ['Diesel', 'Hybride'] }, 'attributes.kilometrage': { $lte: 100000 } },
  { adId: 1, _id: 0 }
).limit(1000).toArray().map((d) => d.adId);

// ── 3. Statistiques ──────────────────────────────────────────────────────────
// Vues d'une annonce par jour (tableau de bord vendeur).
const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
db.ad_views.aggregate([
  { $match: { adId, at: { $gte: since } } },
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } },
              views: { $sum: 1 }, visitors: { $addToSet: '$sessionId' } } },
  { $project: { views: 1, uniqueVisitors: { $size: '$visitors' } } },
  { $sort: { _id: 1 } },
]).toArray();

// Recherches les plus fréquentes (suggestions du champ de recherche).
db.search_events.aggregate([
  { $match: { at: { $gte: since }, q: { $ne: '' } } },
  { $group: { _id: { $toLower: '$q' }, count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 },
]).toArray();
```
Pour les essayer :

```bash
docker compose exec mongo sh -c 'mongosh "mongodb://$MONGO_APP_USER:$MONGO_APP_PASSWORD@localhost:27017/lebondeal?authSource=lebondeal"'
```

puis coller les blocs (le mode interactif de `mongosh` affiche le résultat de chaque expression). `db.ad_details.find({ 'attributes.marque': 'Peugeot' }).explain()` montre l'utilisation de l'index joker.

## 9. Idées MongoDB pour aller plus loin

- **Change streams** : MongoDB prévient le backend à chaque insertion (nouveau message, nouvelle annonce correspondant à une recherche sauvegardée), sans interrogation périodique. Demande un *replica set*, même d'un seul nœud (voir document 04, § 10).
- **Index géospatial `2dsphere`** sur `saved_searches` : alerter « une annonce vient d'apparaître à moins de 10 km de chez vous ».
- **Agrégations pour un tableau de bord vendeur** : vues par jour (déjà dans `examples.js`), taux de contact (vues → conversations), heure de la journée la plus active.
- **Recherches populaires** pour les suggestions du champ de recherche (déjà dans `examples.js`).
- **Index texte Mongo ou Atlas Search** : ne pas faire, la recherche plein texte est mieux servie par PostgreSQL ici.
- **Vue d'ensemble pour la soutenance** : un schéma montrant « une annonce = une ligne SQL + un document Mongo » et le parcours d'un message.

## 10. Ce qui a été vérifié

Sur `mongo:8` (l'image du `compose.yaml`) :

- Le script d'initialisation s'exécute sans erreur ; l'utilisateur applicatif est créé avec le mot de passe lu dans l'environnement ; 9 collections, 9 définitions de catégories, validateurs sur 3 collections, 4 index TTL aux bonnes durées.
- Requêtes de `examples.js` : ouverture de conversation sans doublon, envoi, boîte de réception, pagination, lecture, filtre dynamique, vues par jour, recherches populaires.
- Refus attendus (7 cas), acceptation d'une offre de prix, index joker utilisé.
- Mongoose : création de `AdDetails` (avec champs dynamiques, et avec `attributes` vide), `Conversation` (avec `Map`), `Message` ; le seed insère ~130 fiches et 164 messages.
- Chaîne complète : création d'annonce avec annulation SQL si Mongo échoue ; recherche en deux temps, injection d'opérateur neutralisée.
- Sauvegarde / restauration `mongodump` / `mongorestore`, index TTL conservés.

Non vérifié : comportement des index TTL dans le temps (le délai de suppression), charge importante, *change streams*.
