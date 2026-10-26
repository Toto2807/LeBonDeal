# LeBonDeal — Phase 0 (Fondations) : plan d'implémentation

> **Pour les agents :** exécuter tâche par tâche (`superpowers:executing-plans`). Les cases `- [ ]` suivent l'avancement.

**Objectif :** une pile Docker complète (PostgreSQL, MongoDB, backend, frontend) qui démarre avec une commande, un backend corrigé et branché aux deux bases, un frontend avec thème et routeur, le tout couvert par des tests qui passent.

**Architecture :** monorepo npm existant. Docker Compose lance 4 services ; le code des fichiers à créer est **déjà écrit et testé** dans le dossier de conception : ce plan ne le répète pas, il dit quoi créer, dans quel ordre, et comment vérifier. Le contenu de chaque fichier est le bloc de code portant son chemin dans le document indiqué.

**Stack :** Node 24, Express 5, `pg`, Mongoose 9, zod 4, Socket.IO 4, sharp ; React 19, Vite 7, React Router 8, TanStack Query 5, Tailwind 4 ; PostgreSQL 17, MongoDB 8 ; Docker Compose.

**Spec :** `docs/superpowers/specs/2026-10-26-lebondeal-design.md` et les documents `docs/lebondeal/01…05`. Les lignes du type « [04 §5] » indiquent où se trouve le contenu exact des fichiers.

## Contraintes globales

- Langue : français (commentaires, libellés, documentation).
- Prix en centimes (entiers), identifiants `uuid`, JSON en `camelCase`, SQL en `snake_case`.
- Images : `postgres:17-alpine`, `mongo:8`, `node:24-alpine`, `nginx:alpine`. Pas d'ORM, pas de TypeScript.
- PostgreSQL publié sur le port **5433** (le 5432 est pris par le PostgreSQL 18 de Windows).
- `@hookform/resolvers` en `^5` (la 6.0.0 fait échouer `npm install`).
- Aucun secret dans git : `.env` ignoré, `.env.example` sans vraie valeur.
- **Aucun commit tant que l'utilisateur ne le demande pas.** Les tâches s'arrêtent à « prêt à commiter ».
- Les scripts d'initialisation des bases ne s'exécutent qu'au premier démarrage d'un volume : après toute modification de `database/*/init`, `docker compose down -v`.

## Points de vigilance (Review Focus)

Cas que la spécification laisse implicites et qui peuvent faire échouer une personne réelle ; chacun a son test dans la tâche indiquée.

1. **Variable d'environnement oubliée** : le backend doit refuser de démarrer en nommant les variables manquantes — Tâche 2 (`config.test.js`).
2. **Port déjà utilisé** (5173 est déjà occupé sur cette machine, 5432 aussi) : détecté avant le démarrage et résolu dans `.env` — Tâche 4.
3. **Redémarrage sans perdre les données** : `docker compose down` puis relance ne rejoue pas l'initialisation et le seed est toujours là — Tâche 4.
4. **Installation propre depuis un clone** : `package-lock.json` synchronisé avec les trois `package.json` (`npm ci` passe) — Tâches 2 et 3.
5. **Secrets commités par erreur** : `.env` et `backend/.env` ignorés par git — Tâche 1.

---

### Tâche 1 : Docker, bases de données, hygiène git

**Fichiers**
- Créer : `compose.yaml`, `compose.prod.yaml`, `.env.example`, `.dockerignore` [04 §5]
- Créer : `database/postgres/init/01-schema.sql`, `database/postgres/init/02-seed-categories.sql` [02 §3]
- Créer : `database/mongo/init/01-init.js`, `database/mongo/examples.js` [03 §4, §8]
- Modifier : `.gitignore` (contenu de [04 §5], remplace le fichier actuel qui ne contient que `node_modules`)
- Créer en local, non versionné : `.env` (copie de `.env.example`)

**Interfaces**
- Produit : services Compose `postgres`, `mongo` (sains via healthcheck), `backend`, `frontend` ; variables `POSTGRES_*`, `MONGO_*`, `JWT_SECRET`, `*_PORT` ; base `lebondeal` ; utilisateur Mongo applicatif créé en dernier.

- [ ] **Étape 1 : écrire le test de réception (échoue sans les fichiers)** — `docker compose config -q` doit se terminer sans erreur et `git check-ignore .env` doit afficher `.env`.
- [ ] **Étape 2 : lancer les deux commandes** — `docker compose config -q` → *échec* (« no configuration file provided ») ; `git check-ignore .env` → *rien* (`.gitignore` actuel).
- [ ] **Étape 3 : créer les fichiers** de la liste ci-dessus, puis `Copy-Item .env.example .env`.
- [ ] **Étape 4 : vérifier la configuration** — `docker compose config -q` et `docker compose -f compose.prod.yaml config -q` sans sortie ; `git check-ignore .env` → `.env` ; `git check-ignore backend/.env` → `backend/.env`.
- [ ] **Étape 5 : démarrer les bases** — `docker compose up -d --wait postgres mongo` → les deux `Healthy`.
- [ ] **Étape 6 : vérifier l'initialisation**
  - SQL : `docker compose exec postgres psql -U lebondeal -d lebondeal -Atc "select count(*) filter (where parent_id is null), count(*) filter (where parent_id is not null) from categories"` → `6|21` ; `\dt` liste 8 tables, `\dv` 2 vues.
  - Mongo : la liste des collections a 9 éléments, `category_schemas` contient 9 documents (commande d'inspection : [04 §7], console Mongo).

### Tâche 2 : Backend corrigé et branché aux deux bases

**Fichiers**
- Supprimer : `backend/src/models/User.js`, `models/Task.js`, `routes/taskRoutes.js`, `routes/userRoutes.js`, `controllers/taskController.js`, `controllers/userController.js`, `services/taskService.js`, `services/userService.js`
- Déplacer : `backend/test/app.test.js` → `backend/test/unit/app.test.js` (import `../../src/app.js`)
- Créer : tous les fichiers de `backend/src/` listés dans [02 §6, 03 §5-7, 05 §5-9], `backend/scripts/seed.js` [05 §12], `backend/.env.example` [04 §5], `backend/Dockerfile` [04 §5]
- Créer : `backend/test/unit/upload.test.js`, `sockets.test.js`, `backend/test/integration/ads.integration.test.js` [05 §11]
- Créer : `backend/test/unit/config.test.js` (nouveau, ci-dessous)
- Modifier : `package.json` racine, `backend/package.json` (dépendances et scripts : [04 §4a])

**Interfaces**
- Consomme : bases de la Tâche 1 (`localhost:5433`, `localhost:27017`).
- Produit : API `/api/health`, `/api/auth/{register,login,me}`, `/api/categories[/:slug/schema]`, `/api/ads` (GET, POST), `/api/ads/:id/images` (POST), `/api/favorites[/ids|/:adId]` ; erreurs `{ error: { code, message, details? } }` ; scripts npm `test`, `test:integration`, `seed` (racine et backend) ; `assertConfig(): void` qui lève une erreur listant les variables manquantes.

- [ ] **Étape 1 : écrire `config.test.js`** — test `assertConfig liste les variables manquantes` : après avoir supprimé `DATABASE_URL`, `MONGODB_URI` et `JWT_SECRET` de `process.env` (puis restauré), `assert.throws(() => assertConfig(), /DATABASE_URL, MONGODB_URI, JWT_SECRET/)` ; un second test vérifie que l'appel ne lève rien quand les trois sont définies.
- [ ] **Étape 2 : déplacer le test de santé et poser les tests unitaires** (`app`, `upload`, `sockets`, `config`) ; les scripts `test` / `test:integration` / `seed` de [04 §4a] sont ajoutés.
- [ ] **Étape 3 : lancer `npm test -w backend`** → échec (modules `imageService`, `sockets`, `assertConfig` introuvables).
- [ ] **Étape 4 : installer les dépendances** (commandes backend de [04 §4a]) puis créer les fichiers source, supprimer les anciens.
- [ ] **Étape 5 : lancer `npm test -w backend`** → 9 tests réussis (1 santé + 3 Socket.IO + 3 upload + 2 configuration), 0 échec.
- [ ] **Étape 6 : tests d'intégration en mode hybride** — créer `backend/.env` depuis `backend/.env.example`, puis `npm run test:integration -w backend` → 6 tests réussis (parcours HTTP complet inclus).
- [ ] **Étape 7 : `node --check`** sur chaque fichier `.js` du backend, sans erreur ; `npm ci --dry-run` à la racine sans erreur de synchronisation (point de vigilance 4).

### Tâche 3 : Frontend — thème, routeur, client d'API, recherche

**Fichiers**
- Créer / remplacer : les fichiers de `frontend/src/` de [01 §15] (`index.css`, `main.jsx`, `App.jsx`, `components/{Layout,Header}.jsx`, `routes/ProtectedRoute.jsx`, `api/client.js`, `context/AuthContext.jsx`, `hooks/*`, `lib/*`, `components/ads/*`, `components/forms/DynamicFields.jsx`, `pages/Search.jsx`, tests et `test/setup.js`)
- Créer : `frontend/Dockerfile`, `frontend/nginx.conf` ; remplacer `frontend/vite.config.js` [04 §5]
- Créer : pages provisoires (`Home`, `AdDetail`, `SellerProfile`, `Login`, `Register`, `PostAd`, `NotFound`, `account/{AccountLayout,MyAds,Favorites,Messages,Profile}`) : un titre et une phrase « Page à construire en phase N » ; `Home` propose en plus un lien vers `/recherche`
- Modifier : `frontend/src/components/Footer.jsx` (classes Tailwind à la place de l'ancien CSS), `frontend/index.html` (titre « LeBonDeal »), `frontend/package.json` (dépendances de [04 §4a], script `"test": "vitest run"`)

**Interfaces**
- Consomme : API de la Tâche 2.
- Produit : `api(path, { method, body, params, signal })` → `Promise<{ data, meta? }>` qui lève `ApiError { status, code, details }` ; `useAuth(): { user, loading, login(credentials), logout() }` ; `useAdSearch(): { filters, setFilters(patch), ...query }`.

- [ ] **Étape 1 : poser les tests** `lib/format.test.js` et `routes/ProtectedRoute.test.jsx` avec `test/setup.js` et la section `test` de `vite.config.js`.
- [ ] **Étape 2 : `npm test -w frontend`** → échec (modules absents).
- [ ] **Étape 3 : installer les dépendances** (commandes frontend de [04 §4a], `@hookform/resolvers@^5`), puis créer les fichiers source et les pages provisoires.
- [ ] **Étape 4 : `npm test -w frontend`** → 5 tests réussis.
- [ ] **Étape 5 : `npm run build`** à la racine → « built » sans erreur ; `npm ci --dry-run` sans erreur (point de vigilance 4).

### Tâche 4 : Démarrage complet et critère « terminé quand »

**Fichiers**
- Modifier : `README.md` (démarrage Docker, commandes, mode hybride, lien vers `docs/lebondeal/04-docker.md`)

**Interfaces**
- Consomme : tout ce qui précède.

- [ ] **Étape 1 : contrôler les ports** — `netstat -ano | findstr LISTENING` pour 3000, 5173, 5433, 27017. Si 5173 est occupé, ajouter `FRONTEND_PORT=5174` et `CORS_ORIGIN=http://localhost:5174` dans `.env` (point de vigilance 2).
- [ ] **Étape 2 : arrêter les bases de la Tâche 1** (`docker compose down -v`), puis lancer `docker compose watch` en arrière-plan ; attendre « Watch enabled ».
- [ ] **Étape 3 : santé** — `docker compose ps` : 4 services `Up`, `postgres` et `mongo` `(healthy)` ; `curl http://localhost:3000/api/health` et `curl http://localhost:<FRONTEND_PORT>/api/health` → `{"status":"ok"}`.
- [ ] **Étape 4 : tests dans les conteneurs** — `docker compose exec backend npm test` → tout passe ; `docker compose exec backend npm run test:integration` → 6 réussis.
- [ ] **Étape 5 : seed** — `docker compose exec backend npm run seed` → « Terminé : 30 utilisateurs, 214 annonces… » ; `curl "http://localhost:<FRONTEND_PORT>/api/ads?q=velo&category=velos&limit=2"` → `meta.total` > 0.
- [ ] **Étape 6 : redémarrage sans perte** (point de vigilance 3) — arrêter le watch, `docker compose down` (sans `-v`), `docker compose up -d --wait`, puis `curl` de la recherche de l'étape 5 → mêmes résultats ; le journal Postgres ne contient pas « running /docker-entrypoint-initdb.d ».
- [ ] **Étape 7 : rechargement automatique** — modifier une ligne de `backend/src/app.js` sur l'hôte, constater le changement via `curl`, annuler la modification.
- [ ] **Étape 8 : bilan** — `git status` : seuls des fichiers attendus (pas de `.env`, pas de `node_modules`, pas de `uploads/`), prêt à commiter ; arrêter la pile (`docker compose down`, données conservées) sauf demande contraire.

---

## Auto-relecture

- **Couverture du critère « terminé quand » de la phase 0** : quatre services sains (T4 é3) · `/api/health` via 5173 (T4 é3) · `npm test` et `test:integration` dans le conteneur (T4 é4) · `npm run seed` (T4 é5) · `.env` ignoré (T1 é4). Les corrections du starter listées dans 05 §3 sont toutes portées par T2 (fichiers remplacés ou supprimés, `.gitignore` en T1).
- **Cohérence des noms** : scripts `test` / `test:integration` / `seed` identiques racine et backend ; `assertConfig` défini en T2 et utilisé par `server.js` ; `api()` / `ApiError` définis en T3 et utilisés par les hooks.
- **Proportion** : le plan renvoie aux documents pour tout le code (déjà exécuté) ; il ne porte que l'ordre, les tests nouveaux (`config.test.js`) et les critères.
