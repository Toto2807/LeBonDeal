# LeBonDeal — Backend : le lien entre le front et les deux bases

> Partie 5/5 du dossier de conception. Vue d'ensemble : [`2026-10-26-lebondeal-design.md`](../superpowers/specs/2026-10-26-lebondeal-design.md).
> Les fichiers de ce document (avec ceux des documents 02 et 03) forment une **tranche verticale qui fonctionne** : inscription, connexion, catégories, dépôt d'annonce avec photos, recherche avec filtres dynamiques, favoris, temps réel. Tous ont été exécutés (voir § 13).

## 1. Rôle et structure

Le backend (Express 5, déjà dans le starter) n'a qu'un travail : recevoir une requête du frontend, vérifier qui parle et ce qu'il envoie, parler à PostgreSQL et/ou MongoDB, et répondre en JSON. Il garde l'architecture en couches du starter :

```text
backend/
├─ src/
│  ├─ app.js, server.js
│  ├─ config/        env.js · db.js (MongoDB) · postgres.js (PostgreSQL)
│  ├─ routes/        URL → contrôleur            (authRoutes, adRoutes, categoryRoutes, favoriteRoutes)
│  ├─ controllers/   lit la requête, valide avec zod, appelle un service, formate la réponse
│  ├─ services/      règles métier (adService, authService, favoriteService, categoryService, imageService)
│  ├─ repositories/  requêtes complexes (adRepository : recherche en deux temps)
│  ├─ models/        modèles Mongoose (AdDetails, CategorySchema, Conversation, Message)
│  ├─ schemas/       schémas zod des entrées (adSchemas)
│  ├─ middlewares/   requireAuth · upload · errorHandler
│  ├─ sockets/       temps réel (Socket.IO)
│  ├─ sql/           requêtes SQL longues, dans des fichiers .sql
│  └─ utils/         HttpError · attributes (champs dynamiques)
├─ scripts/seed.js
└─ test/
   ├─ unit/          sans base de données (npm test)
   └─ integration/   avec PostgreSQL + MongoDB (npm run test:integration)
```

**Un chemin de requête type** : `POST /api/ads` → `adRoutes` (`requireAuth`) → `adController.create` (valide le corps avec `createAdSchema`) → `adService.createAd` (vérifie la catégorie, valide les champs dynamiques d'après MongoDB, écrit en SQL puis en Mongo) → réponse `201 { data }`. Toute erreur levée en route est transformée par `errorHandler` en `{ error: { code, message } }`.

## 2. Variables d'environnement

| Variable | Rôle | Exemple de valeur (développement) |
|---|---|---|
| `PORT` | port du serveur | `3000` |
| `DATABASE_URL` | connexion PostgreSQL | `postgres://lebondeal:…@postgres:5432/lebondeal` (dans Docker) |
| `MONGODB_URI` | connexion MongoDB | `mongodb://lebondeal_app:…@mongo:27017/lebondeal?authSource=lebondeal` |
| `JWT_SECRET` | signature des jetons de connexion | longue chaîne aléatoire |
| `CORS_ORIGIN` | origine du frontend autorisée | `http://localhost:5173` |
| `UPLOAD_DIR` | dossier des photos | `/app/backend/uploads` (volume Docker) |

Dans Docker, `compose.yaml` les fournit. En mode hybride, `backend/.env` (voir document 04). `server.js` appelle `assertConfig()` au démarrage : il échoue tout de suite avec la liste des variables manquantes, au lieu de planter plus tard avec une erreur obscure.

## 3. Défauts du starter à corriger

Relevés en lisant le code existant ; les fichiers livrés plus bas les corrigent.

| # | Où | Problème | Conséquence |
|---|---|---|---|
| 1 | `backend/src/app.js:2` | importe `cors`, absent de `backend/package.json` | `npm ci` puis démarrage : le module est introuvable → le backend ne démarre pas |
| 2 | `backend/src/models/User.js:4-5` | `require: true` au lieu de `required: true` | aucune validation de l'e-mail ni du hash |
| 3 | `backend/src/services/authService.js:16-18` | lit `user.passwordHash` **avant** de tester si `user` existe ; `console.log(user)` | connexion avec un e-mail inconnu → erreur 500 ; le hash du mot de passe est écrit dans les journaux |
| 4 | `authService.js:17` + `authController.js` | le corps de la requête va tel quel dans `User.findOne({ email })` | **injection d'opérateur MongoDB** : envoyer `{"email": {"$ne": null}, …}` fait chercher « un utilisateur dont l'e-mail n'est pas nul » |
| 5 | `backend/src/middlewares/requireAuth.js:6,12,15` | affiche le jeton dans les journaux ; ligne 19 `throw Error(...)` dans un `catch` | fuite de jetons ; un jeton invalide donne une erreur 500 au lieu de 401 ; `req.userId` reçoit tout le contenu du jeton, pas l'identifiant |
| 6 | `backend/src/controllers/authController.js:5` | renvoie 200 à l'inscription, sans validation | convention REST : 201 ; mots de passe de 1 caractère acceptés |
| 7 | `backend/.env.example` + `config/env.js:4` | ne contient que `PORT` ; `Number(undefined)` vaut `NaN` | variables oubliées découvertes trop tard |
| 8 | `backend/src/server.js:5` | `await connectDb(config.mongoUri)` sans vérification | message d'erreur Mongoose peu lisible si l'URI manque |
| 9 | `.gitignore` | ne contient que `node_modules` | un fichier `.env` avec des secrets pourrait être commité |
| 10 | pas de gestionnaire d'erreurs | `throw new Error("Email already exists")` | réponse HTML 500 au lieu d'un JSON exploitable par le frontend |

**Fichiers du starter à supprimer** (leur rôle est repris ailleurs) : `models/User.js`, `models/Task.js`, `routes/taskRoutes.js`, `routes/userRoutes.js`, `controllers/taskController.js`, `controllers/userController.js`, `services/taskService.js`, `services/userService.js`. `test/app.test.js` est déplacé en `test/unit/app.test.js` (un seul chemin d'import change).

**Décision à valider.** Le starter stocke les utilisateurs dans MongoDB. Ce plan les déplace dans PostgreSQL : ils sont référencés par presque toutes les tables relationnelles (annonces, favoris, avis), et MongoDB garde un rôle important et bien plus intéressant à présenter (champs dynamiques, messagerie, événements).

## 4. Conventions et contrat d'API

**Conventions** (le frontend s'y appuie : `frontend/src/api/client.js`)

- Succès : `{ "data": … }`, ou `{ "data": […], "meta": { "total", "page", "limit" } }` pour une liste paginée. `204` sans corps pour les ajouts/suppressions idempotents (favoris).
- Erreur : `{ "error": { "code": "VALIDATION", "message": "…", "details": [{ "path": "limit", "message": "…" }] } }`.
- JSON en `camelCase` ; **prix en centimes** ; dates en ISO 8601 UTC ; identifiants en `uuid`.
- Authentification : en-tête `Authorization: Bearer <jeton>`. Le jeton contient `{ sub: <id utilisateur>, role }`.
- Pagination : `page` (à partir de 1) et `limit` (50 maximum) ; l'historique des messages utilise un curseur `before`.
- Codes HTTP : 400 données invalides · 401 non connecté · 403 interdit · 404 introuvable · 409 existe déjà · 413 fichier trop gros · 500 erreur du serveur.
- Codes d'erreur (`error.code`) : `VALIDATION`, `TOKEN_MISSING`, `TOKEN_INVALID`, `INVALID_CREDENTIALS`, `BANNED`, `FORBIDDEN`, `USER_NOT_FOUND`, `AD_NOT_FOUND`, `CATEGORY_INVALID`, `ALREADY_EXISTS`, `INVALID_REFERENCE`, `NO_FILE`, `TOO_MANY_IMAGES`, `UPLOAD`, `UPLOAD_TYPE`, `UPLOAD_INVALID`, `INTERNAL`.

**Contrat.** ✅ = écrit et testé dans ce dossier · ⬜ = à écrire (la phase est indiquée). 🔓 public · 🔐 connecté · 👑 administrateur.

| | Méthode et chemin | Accès | Entrée | Réponse |
|---|---|---|---|---|
| ✅ | `POST /api/auth/register` | 🔓 | `{ email, password (8-72), displayName }` | 201 `{ id, email, displayName, role }` · 409 e-mail déjà pris |
| ✅ | `POST /api/auth/login` | 🔓 | `{ email, password }` | `{ token, user }` · 401 sans dire si le compte existe |
| ✅ | `GET /api/auth/me` | 🔐 | — | profil de l'utilisateur connecté |
| ⬜ P2 | `POST /api/auth/refresh`, `/logout` | 🔐 | cookie `httpOnly` | nouveau jeton court (voir § 10) |
| ✅ | `GET /api/categories` | 🔓 | — | arbre `[{ id, slug, name, icon, children }]` |
| ✅ | `GET /api/categories/:slug/schema` | 🔓 | — | `{ categorySlug, fields }` (MongoDB) |
| ✅ | `GET /api/ads` | 🔓 | `q, category, priceMin, priceMax` (centimes), `lat, lng, radiusKm, sort (recent\|price_asc\|price_desc\|distance), page, limit, attr.*` | `data: [{ id, title, priceCents, city, coverUrl, publishedAt, distanceKm }]`, `meta` |
| ⬜ P1 | `GET /api/ads/:id` | 🔓 | — | annonce complète + photos + `attributes` (Mongo) + vendeur (`ratingAvg`, `ratingCount`) + `priceHint` |
| ✅ | `POST /api/ads` | 🔐 | `createAdSchema` (voir ci-dessous) | 201 annonce créée |
| ⬜ P1 | `PATCH /api/ads/:id`, `DELETE /api/ads/:id` | 🔐 propriétaire | champs modifiables / — | annonce mise à jour / 204 (statut `deleted`) |
| ⬜ P1 | `PATCH /api/ads/:id/status` | 🔐 propriétaire | `{ status, buyerId? }` — `sold` crée la vente (`transactions`) | annonce |
| ✅ | `POST /api/ads/:id/images` | 🔐 propriétaire | multipart, champ `photos` (≤ 10, ≤ 8 Mo) | 201 `[{ id, url, thumbUrl, position }]` |
| ⬜ P1 | `DELETE /api/ads/:id/images/:imageId`, `PATCH /api/ads/:id/images/order` | 🔐 propriétaire | — / `{ ids: […] }` | 204 / 200 |
| ⬜ P1 | `GET /api/users/me/ads` | 🔐 | `status?` | mes annonces |
| ✅ | `GET /api/favorites/ids` | 🔐 | — | `["adId", …]` |
| ✅ | `PUT /api/favorites/:adId`, `DELETE /api/favorites/:adId` | 🔐 | — | 204 (idempotent) |
| ⬜ P2 | `GET /api/favorites` | 🔐 | `page` | cartes d'annonces favorites |
| ⬜ P2 | `GET /api/conversations`, `POST /api/conversations` | 🔐 | — / `{ adId }` (retrouve ou crée) | boîte de réception / conversation |
| ⬜ P2 | `GET /api/conversations/:id/messages` | 🔐 participant | `before?` (date du plus ancien déjà reçu) | `data` (récent → ancien), `meta.nextBefore` |
| ⬜ P2 | `POST /api/conversations/:id/messages`, `POST …/read` | 🔐 participant | `{ text }` ou `{ offer: { amountCents } }` / — | 201 message (puis événement `message:new`) / 204 |
| ⬜ P3 | `GET /api/users/:id`, `…/ads`, `…/reviews` | 🔓 | — | profil vendeur public + `v_seller_stats` |
| ⬜ P3 | `POST /api/reviews` | 🔐 | `{ transactionId, rating, comment }` | 201 (le trigger SQL vérifie que l'auteur a participé à la vente) |
| ⬜ P2 | `POST /api/reports` | 🔐 | `{ adId? , reportedUserId?, reason, details }` | 201 |
| ⬜ P3 | `GET/POST/DELETE /api/saved-searches`, `GET /api/notifications` | 🔐 | — | alertes (Mongo) |
| ⬜ P4 | `POST /api/ads/:id/views`, `GET /api/users/me/stats` | 🔓 / 🔐 | — | événement de vue / statistiques vendeur (agrégation Mongo) |
| ⬜ P4 | `GET /api/admin/reports`, `PATCH /api/admin/reports/:id`, `PATCH /api/admin/users/:id` | 👑 | — | modération |

Corps de `POST /api/ads` : `{ title, description, priceCents, categorySlug, itemCondition?, city, postalCode (5 chiffres), lat?, lng?, shippingAvailable?, attributes? }` — `attributes` est validé contre la définition de la catégorie.

**Contrat Socket.IO** (temps réel, phase 2). Connexion : `io({ auth: { token } })`. Le serveur vérifie le jeton et place chaque socket dans la salle `user:<id>`. Événements du serveur vers le client : `message:new` (message complet, avec `conversationId`) ; plus tard `notification:new`. **L'envoi d'un message passe par `POST …/messages`**, pas par le socket : validation, droits et enregistrement restent au même endroit ; le serveur émet ensuite l'événement au destinataire (et aux autres onglets de l'expéditeur).

## 5. Les fichiers de base

**`backend/src/config/env.js`**

```js
import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};

// Appelée par server.js uniquement : les tests peuvent importer app.js sans variables d'environnement.
export function assertConfig() {
  const missing = ['DATABASE_URL', 'MONGODB_URI', 'JWT_SECRET'].filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')}`);
  }
}
```
**`backend/src/config/db.js`**

```js
import mongoose from 'mongoose';

// autoIndex / autoCreate désactivés : les index et validateurs sont créés par database/mongo/init/01-init.js
export async function connectDb(uri) {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
```
**`backend/src/utils/HttpError.js`**

```js
// Erreur « attendue » : le middleware errorHandler la transforme en réponse JSON avec le bon code HTTP.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
```
**`backend/src/middlewares/errorHandler.js`**

```js
import { ZodError } from 'zod';
import { HttpError } from '../utils/HttpError.js';

const send = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details && { details }) } });

// À brancher en DERNIER dans app.js : app.use(errorHandler)
// Express 5 transmet automatiquement les erreurs des handlers async jusqu'ici.
export function errorHandler(error, _req, res, _next) {
  if (error instanceof HttpError) return send(res, error.status, error.code, error.message);

  // Erreurs de multer (envoi de fichiers) : fichier trop gros -> 413, autre dépassement de limite -> 400
  if (error.name === 'MulterError') {
    const tooBig = error.code === 'LIMIT_FILE_SIZE';
    return send(res, tooBig ? 413 : 400, 'UPLOAD', tooBig ? 'Photo trop lourde (8 Mo maximum)' : 'Envoi de fichiers invalide');
  }

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    return send(res, 400, 'VALIDATION', 'Données invalides', details);
  }

  // Erreurs PostgreSQL : 23505 = valeur déjà existante (UNIQUE), 23503 = référence inexistante (clé étrangère)
  if (error.code === '23505') return send(res, 409, 'ALREADY_EXISTS', 'Cette valeur existe déjà');
  if (error.code === '23503') return send(res, 400, 'INVALID_REFERENCE', 'Référence inconnue');

  console.error(error);
  return send(res, 500, 'INTERNAL', 'Erreur interne du serveur');
}
```
**`backend/src/server.js`**

```js
import app from './app.js';
import { config, assertConfig } from './config/env.js';
import { connectDb } from './config/db.js';
import { pool } from './config/postgres.js';

assertConfig();
await connectDb(config.mongoUri);
await pool.query('SELECT 1'); // échoue tout de suite, avec un message clair, si PostgreSQL est injoignable

app.listen(config.port, () => {
  console.log(`API disponible sur http://localhost:${config.port}`);
});
```
**`backend/src/app.js`**

```js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env.js';
import { authRouter } from './routes/authRoutes.js';
import { categoryRouter } from './routes/categoryRoutes.js';
import { adRouter } from './routes/adRoutes.js';
import { favoriteRouter } from './routes/favoriteRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // les photos peuvent être affichées par le frontend
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Photos d'annonces : les noms de fichiers sont des UUID uniques, donc cache long et immuable
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', immutable: true }));

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/ads', adRouter);
app.use('/api/favorites', favoriteRouter);
// À ajouter au fil des phases : /api/conversations, /api/users, /api/reviews, /api/reports… (voir le contrat d'API)

app.use(errorHandler); // toujours en dernier

export default app;
```
## 6. Authentification

Mots de passe hachés avec `bcryptjs` ; jeton JWT signé, valable 7 jours en phase 1. La connexion répond de la même façon à un e-mail inconnu et à un mauvais mot de passe. L'unicité de l'e-mail est garantie par la base (`citext UNIQUE`) : c'est l'erreur `23505` qui devient une réponse 409, sans « vérifier puis insérer » qui laisserait passer deux inscriptions simultanées. Le hash du mot de passe ne sort jamais de l'API (vérifié par un test).

**`backend/src/middlewares/requireAuth.js`**

```js
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { HttpError } from '../utils/HttpError.js';

// Place req.user = { id, role } si le jeton « Authorization: Bearer <jeton> » est valide, sinon répond 401.
export function requireAuth(req, _res, next) {
  const [scheme, token] = (req.header('Authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'TOKEN_MISSING', 'Authentification requise');
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    throw new HttpError(401, 'TOKEN_INVALID', 'Session expirée ou invalide');
  }
  next();
}

export const requireRole = (role) => (req, _res, next) => {
  if (req.user?.role !== role) throw new HttpError(403, 'FORBIDDEN', 'Accès refusé');
  next();
};
```
**`backend/src/services/authService.js`**

```js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/postgres.js';
import { config } from '../config/env.js';
import { HttpError } from '../utils/HttpError.js';

export async function register({ email, password, displayName }) {
  const passwordHash = await bcrypt.hash(password, 10);
  // L'unicité de l'e-mail est garantie par la base (colonne citext UNIQUE) : pas de « vérifier puis insérer ».
  const [user] = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, role`,
    [email, passwordHash, displayName]
  );
  return user;
}

export async function login({ email, password }) {
  const [user] = await query(
    'SELECT id, email, display_name, role, password_hash, is_banned FROM users WHERE email = $1',
    [email]
  );
  // Même message si l'e-mail est inconnu ou si le mot de passe est faux : on ne révèle pas quels comptes existent.
  const valid = user && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect');
  if (user.isBanned) throw new HttpError(403, 'BANNED', 'Compte suspendu');

  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
  return { token, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } };
}

export async function getMe(userId) {
  const [user] = await query(
    `SELECT id, email, display_name, avatar_url, city, postal_code, role, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Utilisateur introuvable');
  return user;
}
```
**`backend/src/controllers/authController.js`**

```js
import { z } from 'zod';
import * as authService from '../services/authService.js';

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72), // bcrypt ignore tout au-delà de 72 octets
  displayName: z.string().trim().min(2).max(60),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

// Réponses au format { data } ; les erreurs sont mises en forme par middlewares/errorHandler.js
export async function register(req, res) {
  const user = await authService.register(registerSchema.parse(req.body));
  res.status(201).json({ data: user });
}

export async function login(req, res) {
  const session = await authService.login(loginSchema.parse(req.body));
  res.status(200).json({ data: session });
}

export async function me(req, res) {
  res.status(200).json({ data: await authService.getMe(req.user.id) });
}
```
**`backend/src/routes/authRoutes.js`**

```js
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const authRouter = Router();

// 20 tentatives par quart d'heure et par adresse IP : freine les essais de mots de passe
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

authRouter.post('/register', authLimiter, authController.register);
authRouter.post('/login', authLimiter, authController.login);
authRouter.get('/me', requireAuth, authController.me);
```
## 7. Catégories, annonces, favoris

La logique d'`adService` (écriture dans les deux bases) et d'`adRepository` (recherche en deux temps) est expliquée dans le document 03, § 7. Ici : la validation des entrées, les contrôleurs et les routes.

**`backend/src/schemas/adSchemas.js`**

```js
import { z } from 'zod';

export const createAdSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(5000),
    priceCents: z.number().int().min(0).max(2_000_000_000),
    categorySlug: z.string().min(1),
    itemCondition: z.enum(['new', 'like_new', 'good', 'fair', 'for_parts']).optional(),
    city: z.string().trim().min(1).max(120),
    postalCode: z.string().regex(/^\d{5}$/, 'Code postal à 5 chiffres'),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    shippingAvailable: z.boolean().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(), // validé ensuite contre le schéma de la catégorie (MongoDB)
  })
  .refine((ad) => (ad.lat == null) === (ad.lng == null), { message: 'lat et lng vont ensemble' });

// Paramètres de GET /api/ads. Les filtres dynamiques (?attr.carburant=Diesel) sont lus à part, depuis req.query.
export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.string().optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).optional(),
  sort: z.enum(['recent', 'price_asc', 'price_desc', 'distance']).default('recent'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
```
**`backend/src/controllers/adController.js`**

```js
import { z } from 'zod';
import * as adService from '../services/adService.js';
import { searchAds } from '../repositories/adRepository.js';
import { createAdSchema, searchQuerySchema } from '../schemas/adSchemas.js';

export async function create(req, res) {
  const ad = await adService.createAd(req.user.id, createAdSchema.parse(req.body));
  res.status(201).json({ data: ad });
}

// GET /api/ads?q=velo&category=velos&priceMax=30000&sort=price_asc&page=2&attr.type=VTT&attr.prix.max=...
export async function search(req, res) {
  const filters = searchQuerySchema.parse(req.query);
  // Express 5 laisse les clés « attr.xxx » à plat dans req.query : on les regroupe ici
  const rawAttributes = Object.fromEntries(
    Object.entries(req.query).filter(([key]) => key.startsWith('attr.')).map(([key, value]) => [key.slice(5), value])
  );
  const { items, total } = await searchAds(filters, rawAttributes);
  res.json({ data: items, meta: { total, page: filters.page, limit: filters.limit } });
}

// POST /api/ads/:id/images — formulaire multipart, champ « photos » (jusqu'à 10 fichiers)
export async function uploadImages(req, res) {
  const adId = z.uuid().parse(req.params.id);
  const images = await adService.addImages(req.user.id, adId, req.files ?? []);
  res.status(201).json({ data: images });
}
```
**`backend/src/routes/adRoutes.js`**

```js
import { Router } from 'express';
import * as adController from '../controllers/adController.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { uploadPhotos } from '../middlewares/upload.js';

export const adRouter = Router();

adRouter.get('/', adController.search);
adRouter.post('/', requireAuth, adController.create);
adRouter.post('/:id/images', requireAuth, uploadPhotos, adController.uploadImages);
// Phase 1 à compléter : GET /:id, PATCH /:id, DELETE /:id, PATCH /:id/status (voir le contrat d'API)
```
**`backend/src/services/categoryService.js`**

```js
import { query } from '../config/postgres.js';
import { CategorySchema } from '../models/CategorySchema.js';

// Arbre des catégories (PostgreSQL) : [{ id, slug, name, icon, children: [{ id, slug, name }] }]
export async function getCategoryTree() {
  const rows = await query('SELECT id, parent_id, slug, name, icon FROM categories ORDER BY position, id');
  const roots = rows
    .filter((category) => category.parentId === null)
    .map(({ id, slug, name, icon }) => ({ id, slug, name, icon, children: [] }));
  for (const { id, parentId, slug, name } of rows.filter((category) => category.parentId !== null)) {
    roots.find((root) => root.id === parentId).children.push({ id, slug, name });
  }
  return roots;
}

// Champs dynamiques d'une catégorie (MongoDB). Catégorie sans champ particulier : liste vide.
export async function getCategorySchema(slug) {
  const definition = await CategorySchema.findOne({ categorySlug: slug }).lean();
  return { categorySlug: slug, fields: definition?.fields ?? [] };
}
```
**`backend/src/controllers/categoryController.js`**

```js
import * as categoryService from '../services/categoryService.js';

export async function tree(_req, res) {
  res.json({ data: await categoryService.getCategoryTree() });
}

export async function schema(req, res) {
  res.json({ data: await categoryService.getCategorySchema(req.params.slug) });
}
```
**`backend/src/routes/categoryRoutes.js`**

```js
import { Router } from 'express';
import * as categoryController from '../controllers/categoryController.js';

export const categoryRouter = Router();

categoryRouter.get('/', categoryController.tree);
categoryRouter.get('/:slug/schema', categoryController.schema);
```
**`backend/src/services/favoriteService.js`**

```js
import { query } from '../config/postgres.js';

export async function listIds(userId) {
  const rows = await query('SELECT ad_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows.map((row) => row.adId);
}

// Idempotent : ajouter deux fois le même favori ne produit pas d'erreur (clé primaire composite + ON CONFLICT).
export async function add(userId, adId) {
  await query('INSERT INTO favorites (user_id, ad_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, adId]);
}

export async function remove(userId, adId) {
  await query('DELETE FROM favorites WHERE user_id = $1 AND ad_id = $2', [userId, adId]);
}
```
**`backend/src/controllers/favoriteController.js`**

```js
import { z } from 'zod';
import * as favoriteService from '../services/favoriteService.js';

const adIdSchema = z.uuid();

export async function ids(req, res) {
  res.json({ data: await favoriteService.listIds(req.user.id) });
}

export async function add(req, res) {
  await favoriteService.add(req.user.id, adIdSchema.parse(req.params.adId));
  res.status(204).end();
}

export async function remove(req, res) {
  await favoriteService.remove(req.user.id, adIdSchema.parse(req.params.adId));
  res.status(204).end();
}
```
**`backend/src/routes/favoriteRoutes.js`**

```js
import { Router } from 'express';
import * as favoriteController from '../controllers/favoriteController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const favoriteRouter = Router();

favoriteRouter.use(requireAuth); // tout le routeur est réservé aux utilisateurs connectés
favoriteRouter.get('/ids', favoriteController.ids);
favoriteRouter.put('/:adId', favoriteController.add);
favoriteRouter.delete('/:adId', favoriteController.remove);
```
## 8. Photos

Le navigateur envoie les photos en `multipart/form-data` (champ `photos`). `multer` les garde en mémoire (8 Mo et 10 fichiers maximum, types JPEG/PNG/WebP) ; `sharp` vérifie que ce sont de vraies images (le type annoncé par le client peut être falsifié), corrige l'orientation EXIF des photos de téléphone, et enregistre deux versions WebP : 1280 px maximum pour la fiche, 400×300 pour les cartes. Elles sont servies par `express.static('/uploads')` avec un cache long (les noms sont des UUID, jamais réutilisés).

**`backend/src/middlewares/upload.js`**

```js
import multer from 'multer';
import { HttpError } from '../utils/HttpError.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Les photos restent en mémoire le temps d'être redimensionnées par imageService (jamais écrites telles quelles sur le disque).
// Le type MIME envoyé par le client peut être falsifié : imageService vérifie que le fichier est réellement une image.
export const uploadPhotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) callback(null, true);
    else callback(new HttpError(400, 'UPLOAD_TYPE', 'Formats acceptés : JPEG, PNG ou WebP'));
  },
}).array('photos', 10);
```
**`backend/src/services/imageService.js`**

```js
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { HttpError } from '../utils/HttpError.js';

// Enregistre une photo d'annonce en deux tailles WebP : 1280 px maximum (fiche annonce) et 400×300 (cartes de résultats).
// Retourne les URL publiques servies par express.static('/uploads').
export async function saveAdImage(buffer, uploadDir) {
  const id = randomUUID();
  await mkdir(uploadDir, { recursive: true });

  try {
    const image = sharp(buffer, { failOn: 'error' }).rotate(); // rotate() applique l'orientation EXIF des photos de téléphone
    await Promise.all([
      image.clone()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(path.join(uploadDir, `${id}.webp`)),
      image.clone()
        .resize({ width: 400, height: 300, fit: 'cover' })
        .webp({ quality: 75 })
        .toFile(path.join(uploadDir, `${id}-thumb.webp`)),
    ]);
  } catch {
    throw new HttpError(400, 'UPLOAD_INVALID', "Ce fichier n'est pas une image lisible");
  }
  return { url: `/uploads/${id}.webp`, thumbUrl: `/uploads/${id}-thumb.webp` };
}
```
> **Évolution.** Pour un déploiement réel, stocker les photos dans un service S3 (MinIO en local, voir document 04, § 10) : le volume Docker ne se partage pas entre plusieurs serveurs.

## 9. Temps réel (Socket.IO)

Le module est écrit et testé ; il n'est pas encore branché dans `server.js` (inutile avant la messagerie, phase 2). Pour l'activer, remplacer `app.listen(…)` par :

```js
import http from 'node:http';
import { initSockets } from './sockets/index.js';

const server = http.createServer(app);
initSockets(server);
server.listen(config.port, () => console.log(`API disponible sur http://localhost:${config.port}`));
```

Puis, dans le contrôleur d'envoi de message (à écrire en phase 2), après l'enregistrement : `emitToUser(recipientId, 'message:new', message)`.

**`backend/src/sockets/index.js`**

```js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

let io = null;

// Le jeton JWT est envoyé à la connexion (io({ auth: { token } }) côté frontend) et vérifié avant d'accepter le client.
export function initSockets(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.corsOrigin } });

  io.use((socket, next) => {
    try {
      socket.data.userId = jwt.verify(socket.handshake.auth.token, config.jwtSecret).sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  // Une « salle » par utilisateur : tous ses onglets et appareils connectés reçoivent les événements.
  io.on('connection', (socket) => socket.join(`user:${socket.data.userId}`));
  return io;
}

// emitToUser(destinataireId, 'message:new', message) — sans effet si personne n'est connecté.
export const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
```
## 10. Sécurité : liste de contrôle

| Risque | Mesure en place | Reste à faire |
|---|---|---|
| Injection SQL | requêtes paramétrées `$1…` partout ; tri depuis une liste blanche | revue de chaque nouvelle requête |
| Injection d'opérateur MongoDB | entrées validées par zod ; `buildAttributesFilter` convertit en types simples (testé) | ne jamais passer `req.body` ou `req.query` tel quel à un `find` |
| Mots de passe | `bcryptjs`, coût 10 ; longueur 8-72 | — |
| Jetons | secret en variable d'environnement, jamais journalisé ; 401 propre | **phase 2** : jeton court (15 min) + jeton de rafraîchissement en cookie `httpOnly` stocké haché dans `refresh_tokens` (MongoDB, expire seul). Aujourd'hui le jeton de 7 jours est gardé dans `localStorage`, lisible par un script malveillant (XSS) : acceptable pour un projet de cours, à signaler dans le rapport |
| Force brute | `express-rate-limit` sur inscription et connexion (20 essais / 15 min / IP) | limiter aussi l'envoi de messages et le dépôt d'annonces |
| Accès aux données d'autrui (IDOR) | propriétaire vérifié pour les photos (testé : 403) | **à répéter** pour chaque route `PATCH`/`DELETE` et pour les conversations (l'utilisateur doit être un des `participants`) |
| Envoi de fichiers | taille, nombre, type ; contenu vérifié par `sharp` ; noms générés (jamais le nom d'origine) | — |
| En-têtes HTTP | `helmet` | — |
| Secrets | `.env` ignoré par git ; `.env.example` sans vraie valeur | secrets de production différents de ceux du développement |
| Erreurs | `errorHandler` : pas de trace côté client | — |

## 11. Tests

Deux niveaux, qui répondent à deux questions différentes :

- **Unitaires** (`npm test`, aucune base nécessaire, ~1 s) : santé de l'API, traitement d'image, erreurs d'upload, Socket.IO avec jetons valides et falsifiés.
- **Intégration** (`npm run test:integration`, PostgreSQL + MongoDB réels) : le parcours complet décrit ci-dessous. Le test nettoie ce qu'il a créé (utilisateurs, annonces, fiches Mongo, fichiers).

**`backend/test/unit/app.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../../src/app.js';

test('GET /api/health retourne 200 et le statut ok', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});
```
**`backend/test/unit/upload.test.js`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { saveAdImage } from '../../src/services/imageService.js';
import { uploadPhotos } from '../../src/middlewares/upload.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';

const fakePhoto = () => sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#ff6e14' } }).png().toBuffer();

test('saveAdImage produit une image 1280 px et une miniature 400x300 en WebP', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lebondeal-'));
  try {
    const { url, thumbUrl } = await saveAdImage(await fakePhoto(), dir);

    // lecture en mémoire : sharp garde les fichiers ouverts sous Windows, ce qui empêcherait de supprimer le dossier
    const full = await sharp(await readFile(path.join(dir, path.basename(url)))).metadata();
    assert.equal(full.format, 'webp');
    assert.equal(full.width, 1280);
    assert.equal(full.height, 960); // le ratio 4:3 est conservé

    const thumb = await sharp(await readFile(path.join(dir, path.basename(thumbUrl)))).metadata();
    assert.deepEqual([thumb.width, thumb.height], [400, 300]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveAdImage refuse un fichier qui n\'est pas une image', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lebondeal-'));
  try {
    await assert.rejects(saveAdImage(Buffer.from('ceci est du texte'), dir), { code: 'UPLOAD_INVALID', status: 400 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('la route d\'envoi accepte une photo et refuse les mauvais types et les fichiers trop lourds', async () => {
  const app = express();
  app.post('/upload', uploadPhotos, (req, res) => res.status(201).json({ count: req.files.length }));
  app.use(errorHandler);

  const ok = await request(app).post('/upload').attach('photos', await fakePhoto(), { filename: 'a.png', contentType: 'image/png' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.count, 1);

  const wrongType = await request(app).post('/upload').attach('photos', Buffer.from('<script>'), { filename: 'a.html', contentType: 'text/html' });
  assert.equal(wrongType.status, 400);
  assert.equal(wrongType.body.error.code, 'UPLOAD_TYPE');

  const tooBig = await request(app).post('/upload').attach('photos', Buffer.alloc(9 * 1024 * 1024), { filename: 'big.png', contentType: 'image/png' });
  assert.equal(tooBig.status, 413);
});
```
**`backend/test/unit/sockets.test.js`**

```js
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { io as connectClient } from 'socket.io-client';

// env.js lit les variables au moment de l'import : on les définit avant d'importer le module testé.
process.env.JWT_SECRET = 'secret-de-test';
const { initSockets, emitToUser } = await import('../../src/sockets/index.js');

let server;
let io;
let url;

before(async () => {
  server = http.createServer();
  io = initSockets(server);
  await new Promise((resolve) => server.listen(0, resolve)); // port libre choisi par le système
  url = `http://localhost:${server.address().port}`;
});

after(async () => {
  await io.close();
});

const tokenFor = (userId) => jwt.sign({ sub: userId, role: 'user' }, 'secret-de-test');
const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));

test('un utilisateur connecté reçoit les événements qui lui sont destinés', async () => {
  const client = connectClient(url, { auth: { token: tokenFor('user-1') } });
  await once(client, 'connect');

  const received = once(client, 'message:new');
  emitToUser('user-1', 'message:new', { text: 'Bonjour !' });
  assert.deepEqual(await received, { text: 'Bonjour !' });
  client.close();
});

test('un autre utilisateur ne reçoit pas le message', async () => {
  const alice = connectClient(url, { auth: { token: tokenFor('alice') } });
  const bob = connectClient(url, { auth: { token: tokenFor('bob') } });
  await Promise.all([once(alice, 'connect'), once(bob, 'connect')]);

  let bobReceived = false;
  bob.on('message:new', () => { bobReceived = true; });
  const aliceReceived = once(alice, 'message:new');
  emitToUser('alice', 'message:new', { text: 'pour Alice' });
  await aliceReceived;
  await new Promise((resolve) => setTimeout(resolve, 100));

  assert.equal(bobReceived, false);
  alice.close();
  bob.close();
});

test('une connexion sans jeton valide est refusée', async () => {
  const client = connectClient(url, { auth: { token: 'jeton-falsifie' }, reconnection: false });
  const error = await once(client, 'connect_error');
  assert.equal(error.message, 'unauthorized');
  client.close();
});
```
**`backend/test/integration/ads.integration.test.js`**

```js
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
```
Le test d'intégration est celui qui prouve que « tout est branché » : inscription, doublon d'e-mail (même casse différente), connexion, `/me`, création d'annonce dans les deux bases, **annulation SQL quand Mongo échoue**, rejet d'un champ dynamique invalide, recherche en deux temps, tentative d'injection Mongo, catégories, photos servies en `image/webp`, interdiction pour un autre utilisateur, favoris idempotents.

## 12. Données de démonstration (seed)

`npm run seed` remplit les deux bases de façon **reproductible** (graine fixe : mêmes données à chaque exécution, utile pour les démonstrations et les captures du rapport). Il vide d'abord les tables : développement uniquement (le script refuse de tourner avec `NODE_ENV=production`).

Ce qu'il crée : 30 utilisateurs (`admin@lebondeal.test` et `user1…29@lebondeal.test`, mot de passe `password123`), ~214 annonces réparties dans les catégories, 588 photos, 240 favoris, 40 conversations / 164 messages, une vingtaine de ventes, 29 avis, et les fiches `ad_details` des catégories à champs dynamiques (valeurs plausibles générées *d'après* `category_schemas`). Exécuté deux fois : mêmes totaux.

Sources : 154 produits de l'API publique [DummyJSON](https://dummyjson.com) (titres, descriptions, photos ; les titres sont en anglais), 60 annonces générées avec `@faker-js/faker` en français (voitures, vélos, locations, ventes immobilières, photos de [picsum.photos](https://picsum.photos)), 20 grandes villes avec coordonnées. **Les photos du seed sont des liens externes** : le seed marche hors ligne pour les données, mais les images demandent Internet. Si DummyJSON est injoignable, le script continue avec les annonces générées.

**`backend/scripts/seed.js`**

```js
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
```
## 13. Ce qui a été vérifié

- 7 tests unitaires : sous Windows (Node 24) **et** dans le conteneur `node:24-alpine`.
- 6 tests d'intégration contre PostgreSQL 17 et MongoDB 8 réels, dans le conteneur ; les 5 premiers aussi depuis Windows via les ports exposés (mode hybride).
- Seed exécuté deux fois ; puis appels HTTP à travers le proxy Vite : catégories, recherche par texte et tri, filtres dynamiques, rayon 30 km, connexion et `/me`, erreur de validation formatée.
- `node --check` sur les 35 fichiers JavaScript du backend (sources, tests, seed).

Non vérifié : les routes marquées ⬜, la messagerie complète (seul le module Socket.IO est testé), le rafraîchissement de jeton, les performances sous charge.
