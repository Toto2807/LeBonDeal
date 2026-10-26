# LeBonDeal — Docker : tout ce qu'il faut pour démarrer

> Partie 4/5 du dossier de conception. Vue d'ensemble : [`2026-10-26-lebondeal-design.md`](../superpowers/specs/2026-10-26-lebondeal-design.md).
> Tous les fichiers de ce document ont été **exécutés** pendant la préparation (voir « Ce qui a été vérifié » à la fin), sur cette machine, sans toucher au dépôt.

## 1. Ce que Docker fait pour le projet

Une seule commande lance quatre conteneurs identiques sur tous les ordinateurs de l'équipe : plus de « ça marche chez moi ».

| Service | Image | Port dans le conteneur | Port sur votre machine | Données conservées dans |
|---|---|---|---|---|
| `postgres` | `postgres:17-alpine` | 5432 | **5433** (`POSTGRES_PORT`) | volume `pgdata` |
| `mongo` | `mongo:8` | 27017 | 27017 (`MONGO_PORT`) | volume `mongodata` |
| `backend` | construit depuis `backend/Dockerfile` | 3000 | 3000 (`BACKEND_PORT`) | volume `uploads` (photos) |
| `frontend` | construit depuis `frontend/Dockerfile` | 5173 (dev) / 80 (prod) | 5173 (`FRONTEND_PORT`) / 8080 (prod) | — |

Le frontend appelle toujours `/api/...` sur sa propre adresse : en développement c'est le proxy de Vite qui transmet au service `backend`, en production c'est nginx. Le navigateur ne connaît jamais l'adresse du backend, donc pas de problème de CORS.

## 2. Points d'attention propres à cette machine

Constatés avant d'écrire quoi que ce soit :

- **PostgreSQL 18 est déjà installé sur Windows** (service `postgresql-x64-18`) et occupe le port 5432. Le conteneur est donc publié sur **5433**. Dans les outils graphiques (DBeaver, pgAdmin), utilisez le port 5433, pas 5432 : sinon vous vous connecteriez à la mauvaise base sans le savoir.
- **Un processus Node écoutait déjà sur `[::1]:5173`** (un autre serveur Vite). S'il tourne encore, arrêtez-le ou mettez `FRONTEND_PORT=5174` dans `.env`.
- Versions présentes : Docker 29.8.1, Compose v5.5.1, Node 24.11.1, npm 11.6.0. Rien à installer.
- **Git Bash convertit les chemins Unix** : `docker compose exec backend ls /app` devient `C:/Program Files/Git/app`. Utilisez PowerShell, ou préfixez la commande de `MSYS_NO_PATHCONV=1`. Toutes les commandes de ce document fonctionnent telles quelles dans PowerShell.
- **N'utilisez jamais `>` pour sauvegarder un fichier binaire** (dump Mongo, dump PostgreSQL) dans PowerShell : la redirection réencode et corrompt. Les commandes de sauvegarde ci-dessous passent par `docker compose cp`.

## 3. Arborescence ajoutée au dépôt

```text
LeBonDeal/
├─ compose.yaml                  développement (4 services, rechargement automatique)
├─ compose.prod.yaml             démonstration / soutenance (nginx, bases non exposées)
├─ .env.example  →  .env         secrets et ports (.env n'est jamais versionné)
├─ .dockerignore
├─ .gitignore                    complété : .env, dist, uploads, sauvegardes
├─ database/
│  ├─ postgres/init/01-schema.sql, 02-seed-categories.sql
│  └─ mongo/init/01-init.js
├─ backend/
│  ├─ Dockerfile
│  └─ .env.example               uniquement pour le mode « hybride » (§ 6)
└─ frontend/
   ├─ Dockerfile
   ├─ nginx.conf                 utilisé seulement en production
   └─ vite.config.js             modifié : proxy configurable, Tailwind, Vitest
```

Les contextes de build sont **la racine du dépôt**, pas les sous-dossiers : le projet utilise les workspaces npm, donc un seul `package-lock.json` à la racine, que les deux images doivent voir.

## 4. Premier démarrage, pas à pas

**a) Installer les dépendances ajoutées** (une fois, sur votre machine : cela met à jour `package.json` et `package-lock.json`, que Docker utilise ensuite).

```bash
npm install -w backend cors pg zod multer sharp socket.io express-rate-limit
npm install -w backend -D @faker-js/faker socket.io-client
npm install -w frontend react-router @tanstack/react-query react-hook-form zod "@hookform/resolvers@^5" leaflet react-leaflet socket.io-client lucide-react sonner tailwindcss @tailwindcss/vite
npm install -w frontend -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

> ⚠ **`@hookform/resolvers@^5` est volontairement épinglé.** La version 6.0.0 (la plus récente au moment des tests) fait échouer `npm install` avec une erreur `ERESOLVE` sur des dépendances optionnelles. La 5.x fonctionne avec zod 4.
> Et `cors` manque déjà dans le `package.json` du backend alors que `app.js` l'importe : sans la première ligne, le backend ne démarre pas.

Puis compléter les scripts à la main (les guillemets imbriqués se comportent différemment sous PowerShell et bash, donc pas de commande `npm pkg set`). Dans `package.json` **à la racine**, ajouter dans `scripts` — dans le conteneur, npm s'exécute à la racine du dépôt, ces deux scripts font passer la commande au backend :

```json
"test:integration": "npm run test:integration --workspace backend",
"seed": "npm run seed --workspace backend"
```

Dans `backend/package.json`, le bloc `scripts` complet :

```json
"scripts": {
  "dev": "node --watch src/server.js",
  "start": "node src/server.js",
  "test": "node --test \"test/unit/**/*.test.js\"",
  "test:integration": "node --test --test-concurrency=1 \"test/integration/**/*.test.js\"",
  "seed": "node scripts/seed.js"
}
```

Et dans `frontend/package.json`, ajouter `"test": "vitest run"` dans `scripts`.

> `node --test` n'accepte **pas** un dossier (`node --test test/unit` échoue) : il faut un motif glob entre guillemets, comme ci-dessus.

**b) Créer, modifier et supprimer les fichiers** (je m'en charge dès que vous validez ce dossier ; sinon, copiez-les depuis les documents). Le backend du starter ne démarre pas tel quel (voir 05, § 3), donc la phase 0 ne se limite pas aux fichiers Docker :

| Action | Fichiers | Où les trouver |
|---|---|---|
| **Créer** | `compose.yaml`, `compose.prod.yaml`, `.env.example`, `.dockerignore`, `backend/Dockerfile`, `backend/.env.example`, `frontend/Dockerfile`, `frontend/nginx.conf` | ce document, § 5 |
| **Créer** | `database/postgres/init/01-schema.sql`, `02-seed-categories.sql` · `backend/src/sql/*.sql` | document 02 |
| **Créer** | `database/mongo/init/01-init.js`, `database/mongo/examples.js` · `backend/src/models/*`, `utils/attributes.js`, `services/adService.js`, `repositories/adRepository.js` | document 03 |
| **Créer** | le reste de `backend/src/` (config, middlewares, routes, contrôleurs, services, schémas, sockets), `backend/scripts/seed.js`, `backend/test/` | document 05 |
| **Créer** | `frontend/src/` : thème, routeur, client d'API, authentification, recherche, composants | document 01, § 15 |
| **Modifier** | `package.json` (racine, backend, frontend : scripts ci-dessus) · `frontend/vite.config.js` · `.gitignore` · `frontend/index.html` (titre de la page) · `README.md` | ce document + documents 01 et 05 |
| **Supprimer** | `backend/src/models/User.js`, `Task.js`, `routes/taskRoutes.js`, `userRoutes.js`, `controllers/taskController.js`, `userController.js`, `services/taskService.js`, `userService.js` ; `frontend/src/pages/Home.jsx` est réécrit | document 05, § 3 |

Puis, une fois les fichiers en place :

```powershell
Copy-Item .env.example .env
```

Sous bash : `cp .env.example .env`. Les valeurs par défaut conviennent au développement.

**c) Démarrer**

```bash
docker compose watch
```

Cette commande construit les images, démarre les quatre services dans le bon ordre (le backend attend que les deux bases soient `healthy`) et **surveille votre code** : chaque modification de `backend/src` ou `frontend/src` est copiée dans le conteneur, qui redémarre ou recharge tout seul. Le premier lancement prend environ une minute (téléchargement des images, `npm ci`, initialisation des bases).
`docker compose up --build --watch` est l'équivalent documenté qui affiche en plus les journaux des services (je n'ai testé que `docker compose watch`).

**d) Dans un second terminal**

```bash
docker compose ps
```

Les quatre services doivent être `Up`, et `postgres` / `mongo` `(healthy)`. Puis :

```bash
docker compose exec backend npm run seed
```

Le seed vide les bases puis crée 30 utilisateurs, ~210 annonces avec photos, des conversations et des avis. Compte de test : `admin@lebondeal.test` / `password123`.

**e) Ouvrir** http://localhost:5173 (site), http://localhost:5173/api/health (API via le proxy), http://localhost:3000/api/health (API directe).

**f) Lancer les tests**

```bash
docker compose exec backend npm test
docker compose exec backend npm run test:integration
```

Le premier ne demande aucune base. Le second écrit réellement dans PostgreSQL et MongoDB (et nettoie ensuite).

## 5. Les fichiers

**`.env.example`**

```ini
# Copier ce fichier en « .env » à la racine du projet : cp .env.example .env
# Le fichier .env n'est jamais versionné (voir .gitignore).
# En développement, garder des mots de passe alphanumériques : ils sont insérés dans des URL de connexion.

# ── PostgreSQL ──
POSTGRES_USER=lebondeal
POSTGRES_PASSWORD=lebondeal_dev_pg
POSTGRES_DB=lebondeal
# 5433 car le port 5432 est déjà pris par PostgreSQL installé sur cette machine
POSTGRES_PORT=5433

# ── MongoDB ──
MONGO_ROOT_USER=root
MONGO_ROOT_PASSWORD=lebondeal_dev_mongo_root
MONGO_APP_USER=lebondeal_app
MONGO_APP_PASSWORD=lebondeal_dev_mongo_app
MONGO_PORT=27017

# ── Applications ──
JWT_SECRET=remplacer-par-une-longue-chaine-aleatoire
BACKEND_PORT=3000
FRONTEND_PORT=5173
CORS_ORIGIN=http://localhost:5173
```
**`compose.yaml`**

```yaml
# LeBonDeal : environnement de DÉVELOPPEMENT
#   docker compose up --build --watch      (tout lancer, avec rechargement automatique du code)
#   docker compose up -d postgres mongo    (seulement les bases, pour lancer le code avec « npm run dev »)
name: lebondeal

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "${POSTGRES_PORT:-5433}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 12

  mongo:
    image: mongo:8
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
      MONGO_INITDB_DATABASE: lebondeal
      MONGO_APP_USER: ${MONGO_APP_USER}
      MONGO_APP_PASSWORD: ${MONGO_APP_PASSWORD}
    ports:
      - "${MONGO_PORT:-27017}:27017"
    volumes:
      - mongodata:/data/db
      - ./database/mongo/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      # Connexion avec l'utilisateur applicatif : ne passe au vert qu'une fois le script d'init terminé
      test: ["CMD-SHELL", "mongosh \"mongodb://$${MONGO_APP_USER}:$${MONGO_APP_PASSWORD}@localhost:27017/lebondeal?authSource=lebondeal\" --quiet --eval 'quit(db.runCommand({ping:1}).ok ? 0 : 1)'"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 10s

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
      target: dev
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      mongo:
        condition: service_healthy
    environment:
      NODE_ENV: development
      PORT: 3000
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      MONGODB_URI: mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@mongo:27017/lebondeal?authSource=lebondeal
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:5173}
      UPLOAD_DIR: /app/backend/uploads
    ports:
      - "${BACKEND_PORT:-3000}:3000"
    volumes:
      - uploads:/app/backend/uploads
    develop:
      watch:
        - action: sync+restart    # le code est copié puis le conteneur redémarre (~2 s) : fiable à chaque modification
          path: ./backend/src
          target: /app/backend/src
        - action: rebuild         # nouvelle dépendance : l'image est reconstruite
          path: ./backend/package.json
        - action: rebuild
          path: ./package-lock.json

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
      target: dev
    restart: unless-stopped
    depends_on:
      - backend
    environment:
      VITE_PROXY_TARGET: http://backend:3000   # le proxy Vite vise le service « backend », pas localhost
    ports:
      - "${FRONTEND_PORT:-5173}:5173"
    develop:
      watch:
        - action: sync
          path: ./frontend/src
          target: /app/frontend/src
        - action: sync
          path: ./frontend/index.html
          target: /app/frontend/index.html
        - action: sync+restart
          path: ./frontend/vite.config.js
          target: /app/frontend/vite.config.js
        - action: rebuild
          path: ./frontend/package.json

volumes:
  pgdata:
  mongodata:
  uploads:
```
Ce qu'il faut savoir sur `compose.yaml` :

- **`depends_on` + `healthcheck`** : le backend ne démarre qu'après les deux bases. Le healthcheck de Mongo se connecte avec l'utilisateur applicatif, créé **en dernier** par le script d'initialisation : le service n'est donc « healthy » qu'une fois les collections, validateurs et index tous créés. Avec un simple `ping`, il y a un risque (piège connu des images Mongo, non reproduit ici) que le service soit déclaré prêt alors que le serveur temporaire d'initialisation répond encore, et que le backend échoue à s'authentifier.
- **`develop.watch`** (Compose Watch) remplace les montages de dossiers. Sous Windows, les montages ne transmettent pas toujours les événements de modification aux conteneurs Linux (raison de ce choix ; je n'ai pas mesuré le défaut ici). Avec Watch, le fichier est *copié* dans le conteneur. **Backend : `sync+restart`** — après chaque copie, le conteneur redémarre (2 à 3 secondes). **Frontend : `sync`** — Vite voit la copie comme une modification locale et recharge le navigateur (1 à 2 secondes).
  - *Pourquoi pas un simple `sync` pour le backend ?* C'était mon premier choix, avec `node --watch` dans le conteneur. Mesuré : le fichier est bien recopié à chaque fois, mais `node --watch` ne redémarre que **la première fois** ; les modifications suivantes n'ont plus aucun effet visible (168 s d'attente sans changement). `sync+restart` supprime ce piège.
  - Vérifié sur le projet réel : quatre modifications successives du backend (deux méthodes d'écriture : remplacement de fichier et écriture en place) et trois du frontend, toutes répercutées.
- `node_modules` reste **dans l'image** (Linux) et n'est jamais écrasé par celui de Windows : les binaires natifs (`sharp`, `rollup`) ne sont pas les mêmes d'un système à l'autre.
- Les scripts d'initialisation (`database/*/init`) ne s'exécutent **qu'au premier démarrage d'un volume vide** (voir § 8).

**`backend/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Contexte de build = racine du dépôt (le package-lock.json des workspaces npm y est).

# ── Dépendances de développement ──
FROM node:24-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend
COPY backend ./backend
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace", "backend"]

# ── Production : dépendances sans devDependencies, utilisateur non-root ──
FROM node:24-alpine AS prod
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --omit=dev
COPY backend ./backend
RUN mkdir -p /app/backend/uploads && chown -R node:node /app/backend/uploads
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "backend/src/server.js"]
```
**`frontend/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Contexte de build = racine du dépôt (le package-lock.json des workspaces npm y est).

# ── Développement : serveur Vite avec rechargement à chaud ──
FROM node:24-alpine AS dev
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend
COPY frontend ./frontend
ENV NODE_ENV=development
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace", "frontend", "--", "--host", "0.0.0.0"]

# ── Production, étape 1 : construire les fichiers statiques ──
FROM dev AS build
ENV NODE_ENV=production
RUN npm run build --workspace frontend

# ── Production, étape 2 : nginx sert le site et relaie /api vers le backend ──
FROM nginx:alpine AS prod
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
```
Pourquoi `ENV NODE_ENV=production` dans l'étape `build` : Vite lit cette variable ; si elle valait `development`, `vite build` produirait un site de développement (React non minifié, plus lourd).

**`frontend/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En local le backend est sur localhost:3000 ; dans Docker, compose fournit VITE_PROXY_TARGET=http://backend:3000
const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': target,
      '/uploads': target,
      '/socket.io': { target, ws: true }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js'
  }
});
```
**`.dockerignore`**

```
**/node_modules
**/dist
**/coverage
.git
.env
*.log
backend/uploads
docs
database
```
**`frontend/nginx.conf`**

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  client_max_body_size 12m;                 # photos d'annonces

  location /api/ {
    proxy_pass http://backend:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /uploads/ {
    proxy_pass http://backend:3000;
  }

  location /socket.io/ {                    # messagerie temps réel (WebSocket)
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }

  location / {                              # application React : toute route inconnue renvoie index.html
    try_files $uri /index.html;
  }
}
```
**`compose.prod.yaml`**

```yaml
# LeBonDeal : version « production » (démonstration / soutenance)
#   docker compose -f compose.prod.yaml up -d --build
# Site : http://localhost:8080 — nginx sert React et relaie /api, /uploads et /socket.io vers le backend.
# Les bases ne sont pas exposées sur la machine hôte.
name: lebondeal-prod

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 12

  mongo:
    image: mongo:8
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
      MONGO_INITDB_DATABASE: lebondeal
      MONGO_APP_USER: ${MONGO_APP_USER}
      MONGO_APP_PASSWORD: ${MONGO_APP_PASSWORD}
    volumes:
      - mongodata:/data/db
      - ./database/mongo/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "mongosh \"mongodb://$${MONGO_APP_USER}:$${MONGO_APP_PASSWORD}@localhost:27017/lebondeal?authSource=lebondeal\" --quiet --eval 'quit(db.runCommand({ping:1}).ok ? 0 : 1)'"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 10s

  backend:
    build:
      context: .
      dockerfile: backend/Dockerfile
      target: prod
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      mongo:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      MONGODB_URI: mongodb://${MONGO_APP_USER}:${MONGO_APP_PASSWORD}@mongo:27017/lebondeal?authSource=lebondeal
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://localhost:8080}
      UPLOAD_DIR: /app/backend/uploads
    volumes:
      - uploads:/app/backend/uploads

  frontend:
    build:
      context: .
      dockerfile: frontend/Dockerfile
      target: prod
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "8080:80"

volumes:
  pgdata:
  mongodata:
  uploads:
```
**`backend/.env.example`**

```ini
# Uniquement pour le mode « hybride » : bases de données dans Docker, backend lancé sur votre machine (npm run dev).
# Copier en « backend/.env » : cp backend/.env.example backend/.env
# Dans le mode tout-Docker, ces variables viennent de compose.yaml : ce fichier est inutile.
# Les mots de passe et les ports doivent correspondre au fichier .env de la racine.
PORT=3000
DATABASE_URL=postgres://lebondeal:lebondeal_dev_pg@localhost:5433/lebondeal
MONGODB_URI=mongodb://lebondeal_app:lebondeal_dev_mongo_app@localhost:27017/lebondeal?authSource=lebondeal
JWT_SECRET=remplacer-par-une-longue-chaine-aleatoire
CORS_ORIGIN=http://localhost:5173
UPLOAD_DIR=./uploads
```
Ajouter à `.gitignore` (le fichier actuel ne contient que `node_modules`, donc `.env` pourrait être commité par erreur) :

**`.gitignore`**

```
node_modules
dist
coverage
.env
*.log
backend/uploads
backups
.DS_Store
```
## 6. Deux façons de travailler

| | **Tout-Docker** (recommandé pour l'équipe) | **Hybride** |
|---|---|---|
| Commande | `docker compose watch` | `docker compose up -d --wait postgres mongo` puis `npm run dev` |
| Où tourne le code | dans des conteneurs | sur votre machine (Node 24) |
| Avantage | environnement identique pour tous, comme en production | démarrage instantané, débogage et éditeur plus simples |
| Configuration | `.env` racine | `.env` racine **+** `backend/.env` (copie de `backend/.env.example`) |

Le mode hybride a été testé : les mêmes tests d'intégration passent depuis Windows en visant `localhost:5433` et `localhost:27017`.
Les deux modes se combinent : bases dans Docker en permanence, et `docker compose watch` seulement pour vérifier avant un rendu.

## 7. Mémo des commandes

| Je veux… | Commande |
|---|---|
| Tout démarrer avec rechargement automatique | `docker compose watch` |
| Démarrer sans rechargement, en arrière-plan | `docker compose up -d --build` |
| Voir l'état et la santé | `docker compose ps` |
| Suivre les journaux d'un service | `docker compose logs -f backend` (ou `mongo`, `postgres`, `frontend`) |
| Arrêter (les données restent) | `docker compose down` |
| **Tout effacer, bases comprises** | `docker compose down -v` |
| Ouvrir une console SQL | `docker compose exec postgres psql -U lebondeal -d lebondeal` |
| Ouvrir une console Mongo | `docker compose exec mongo sh -c 'mongosh "mongodb://$MONGO_APP_USER:$MONGO_APP_PASSWORD@localhost:27017/lebondeal?authSource=lebondeal"'` |
| Peupler les bases | `docker compose exec backend npm run seed` |
| Tests unitaires / d'intégration | `docker compose exec backend npm test` / `npm run test:integration` |
| Reconstruire après un changement de dépendances | `docker compose up -d --build backend` (Watch le fait seul quand `package.json` change) |
| Un shell dans le backend | `docker compose exec backend sh` |
| Version de démonstration | `docker compose -f compose.prod.yaml up -d --build` puis http://localhost:8080 |
| Arrêter la démonstration, bases comprises | `docker compose -f compose.prod.yaml down -v` |

**Connexion depuis un outil graphique** (la base doit être démarrée) :

- DBeaver / pgAdmin → hôte `localhost`, port **5433**, base `lebondeal`, utilisateur `lebondeal`, mot de passe `POSTGRES_PASSWORD` du `.env`.
- MongoDB Compass → `mongodb://lebondeal_app:<MONGO_APP_PASSWORD>@localhost:27017/lebondeal?authSource=lebondeal`
- Administration Mongo (rarement utile) → `mongodb://root:<MONGO_ROOT_PASSWORD>@localhost:27017/?authSource=admin`

**Sauvegarder et restaurer** (testé : après suppression volontaire de 240 favoris et 164 messages, tout est revenu, y compris les index TTL) :

```powershell
mkdir backups
# PostgreSQL
docker compose exec postgres pg_dump -U lebondeal -Fc -f /tmp/lebondeal.dump lebondeal
docker compose cp postgres:/tmp/lebondeal.dump ./backups/lebondeal.dump
# MongoDB
docker compose exec mongo sh -c 'mongodump --quiet --uri "mongodb://$MONGO_APP_USER:$MONGO_APP_PASSWORD@localhost:27017/lebondeal?authSource=lebondeal" --archive=/tmp/mongo.archive'
docker compose cp mongo:/tmp/mongo.archive ./backups/mongo.archive
```

Restauration (les fichiers doivent d'abord être recopiés dans les conteneurs avec `docker compose cp ./backups/... service:/tmp/...`) :

```powershell
docker compose exec postgres pg_restore -U lebondeal -d lebondeal --clean --if-exists /tmp/lebondeal.dump
docker compose exec mongo sh -c 'mongorestore --quiet --drop --uri "mongodb://$MONGO_APP_USER:$MONGO_APP_PASSWORD@localhost:27017/?authSource=lebondeal" --archive=/tmp/mongo.archive'
```

Le dossier `backups/` est ignoré par git. Pour partager une base de démonstration avec l'équipe, `npm run seed` suffit : les données sont reproductibles (graine fixe).

## 8. Quand quelque chose ne marche pas

| Symptôme | Cause probable | Solution |
|---|---|---|
| `port is already allocated` ou `address already in use` | un autre programme utilise le port | changer `*_PORT` dans `.env`, ou arrêter l'autre programme |
| Le schéma SQL ou les collections Mongo n'ont pas changé après modification des scripts `database/*/init` | ces scripts ne tournent qu'à la création du volume | `docker compose down -v` puis `docker compose watch`, puis `npm run seed` |
| `Authentication failed` côté Mongo après avoir changé un mot de passe dans `.env` | l'utilisateur a été créé avec l'ancien mot de passe, au premier démarrage | `docker compose down -v` (efface les données) |
| `backend` redémarre en boucle, journal « Variables d'environnement manquantes » | `.env` absent ou incomplet | `Copy-Item .env.example .env` |
| `ECONNREFUSED 127.0.0.1:5432` en mode hybride | `DATABASE_URL` vise le port 5432 (le PostgreSQL de Windows) | utiliser le port **5433** |
| `npm ci` échoue dans la construction de l'image : lockfile désynchronisé | `package.json` modifié sans mettre à jour `package-lock.json` | refaire `npm install` sur la machine et commiter le lockfile |
| Le site s'affiche mais `/api/...` renvoie une erreur de proxy | le backend n'est pas encore prêt, ou `VITE_PROXY_TARGET` absent | `docker compose logs backend` |
| Modifications de code non prises en compte | `docker compose watch` n'est pas lancé (seulement `up -d`) | lancer `docker compose watch` |
| `cannot take exclusive lock for project` au lancement de `watch` | un autre `docker compose watch` de ce projet tourne encore (terminal oublié, ou processus resté après l'arrêt d'un outil) | l'arrêter avec Ctrl+C dans son terminal ; sinon terminer le processus `docker-compose.exe … watch` dans le gestionnaire des tâches |
| Nettoyer l'espace disque | images et volumes inutilisés | `docker system df`, puis `docker image prune` (jamais `-a` ni `volume prune` sans avoir lu : ils touchent aussi vos autres projets) |

## 9. Production / soutenance

`compose.prod.yaml` construit l'image `prod` du backend (dépendances sans `devDependencies`, exécutée par l'utilisateur non-root `node`) et celle du frontend (fichiers statiques servis par nginx, qui relaie `/api`, `/uploads` et `/socket.io`). Les bases ne sont pas publiées sur la machine. Testé : `/api/health` via nginx, une route React inconnue (`/compte/annonces`) renvoie bien `index.html`, le backend tourne sous `node`.

Avant une vraie mise en ligne, il faudrait : de vrais secrets (`JWT_SECRET` long et aléatoire, mots de passe de bases), HTTPS (un reverse proxy comme Caddy suffit), des sauvegardes planifiées, et un `CORS_ORIGIN` égal au vrai domaine.

## 10. Idées pour aller plus loin côté infrastructure

Rien de ce qui suit n'est nécessaire au projet ni testé ici, mais chaque idée se branche en quelques lignes dans `compose.yaml` :

- **Mailpit** : faux serveur d'e-mails avec interface web, pour tester « confirmer mon e-mail » et « mot de passe oublié » sans envoyer de vrais messages.
- **MinIO** : stockage de photos compatible S3. Remplacerait le volume `uploads` et prépare un déploiement cloud.
- **Redis** : limitation de débit partagée entre plusieurs instances du backend, cache des catégories et des résultats populaires.
- **Meilisearch** : recherche tolérante aux fautes, si la recherche PostgreSQL ne suffit plus.
- **Adminer / mongo-express** : interfaces web d'administration, à la place de DBeaver et Compass.
- **GitHub Actions** : exécuter `npm test` et `npm run test:integration` à chaque push, avec PostgreSQL et MongoDB en conteneurs de service.
- **Replica set Mongo à un seul nœud** : nécessaire pour les *change streams* de MongoDB (notifications poussées sans interroger la base).

## 11. Ce qui a été vérifié

Exécuté pour de vrai (Docker 29.8.1, copie du dépôt hors du projet, tout supprimé ensuite) :

- `docker compose config` : syntaxe valide pour `compose.yaml` et `compose.prod.yaml`.
- Démarrage des quatre services, `healthy` pour les deux bases ; scripts d'initialisation SQL et Mongo exécutés sans erreur.
- `GET /api/health` en direct et à travers le proxy Vite ; page Vite en HTTP 200.
- Compose Watch : quatre modifications successives de `backend/src/app.js` (2 à 3 s chacune) et trois de `frontend/src/pages/Home.jsx` (1 à 2 s), toutes répercutées. Un premier essai avec un simple `sync` côté backend avait montré que `node --watch` ne redémarre qu'une fois : corrigé par `sync+restart`.
- Image `prod` : nginx → API, fallback React, utilisateur non-root, ports des bases non publiés.
- Binaires natifs sous Alpine : `sharp` fonctionne dans `node:24-alpine`, et le lockfile contient bien les variantes `musl` (`sharp`, `rollup`).
- Sauvegarde / restauration PostgreSQL et MongoDB depuis PowerShell.

Non vérifié : `docker compose up --watch` (équivalent de `watch`), le déclenchement automatique de l'action `rebuild` quand `package.json` change, l'action `sync+restart` de `vite.config.js`, un déploiement sur un vrai serveur.
