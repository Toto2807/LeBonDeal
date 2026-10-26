# LeBonDeal

Site de petites annonces entre particuliers (projet étudiant Full Stack JS) : déposer une annonce avec photos, chercher avec des filtres, contacter un vendeur.

- **Frontend** : React 19, Vite, React Router, TanStack Query, Tailwind CSS
- **Backend** : Express 5
- **Bases de données** : PostgreSQL (utilisateurs, annonces, favoris, ventes, avis) et MongoDB (champs propres à chaque catégorie, messagerie, statistiques)
- **Docker** : une commande lance les quatre services

## Où en est le projet

| Phase | Contenu | État |
|---|---|---|
| 0 — Fondations | Docker, PostgreSQL, MongoDB, squelette backend, thème frontend | ✅ |
| 1 — Catalogue | inscription / connexion, accueil, recherche avec filtres, fiche annonce, dépôt en 5 étapes avec photos, modification, statut (réservée, vendue, archivée), mes annonces | ✅ |
| 2 — Interaction | favoris (page), messagerie en direct, signalement | à faire |
| 3 — Confiance | ventes et avis, profil vendeur, recherche par distance, carte | à faire |
| 4 — Finitions | modération, statistiques, accessibilité, version de démonstration | à faire |

Les routes « Messages » et « Favoris » de l'en-tête affichent pour l'instant une page « bientôt disponible ».

Toute la conception est dans [`docs/superpowers/specs/2026-10-26-lebondeal-design.md`](docs/superpowers/specs/2026-10-26-lebondeal-design.md) et [`docs/lebondeal/`](docs/lebondeal/).

## Prérequis

- Docker Desktop (Compose v2.22 ou plus récent)
- Node.js 20 ou plus récent et npm 10 ou plus récent (pour `npm install` et le mode hybride)

## Démarrage rapide

```bash
npm install
cp .env.example .env        # PowerShell : Copy-Item .env.example .env
docker compose watch
```

La première fois, comptez une minute : téléchargement des images, installation des dépendances, initialisation des bases. Le code est ensuite rechargé automatiquement à chaque modification de `backend/src` ou `frontend/src`.

Dans un second terminal, pour remplir les bases avec des données de démonstration :

```bash
docker compose exec backend npm run seed
```

| Adresse | Contenu |
|---|---|
| http://localhost:5173 | le site (le port se règle avec `FRONTEND_PORT` dans `.env`) |
| http://localhost:3000/api/health | l'API |

Compte de démonstration : `admin@lebondeal.test` / `password123`.

> Si un autre programme utilise déjà le port 5173 (ou 3000, 5433, 27017), changez le port correspondant dans `.env` ; pour le frontend, mettez aussi `CORS_ORIGIN` à la même adresse. PostgreSQL est publié sur **5433** pour ne pas entrer en conflit avec un PostgreSQL installé sur la machine.

## Commandes

| Je veux… | Commande |
|---|---|
| Tout démarrer avec rechargement automatique | `docker compose watch` |
| Voir l'état des services | `docker compose ps` |
| Suivre les journaux | `docker compose logs -f backend` |
| Arrêter (les données restent) | `docker compose down` |
| **Tout effacer, bases comprises** | `docker compose down -v` |
| Tests unitaires du backend | `docker compose exec backend npm test` |
| Tests d'intégration (vraies bases) | `docker compose exec backend npm run test:integration` |
| Tests du frontend | `npm test -w frontend` |
| Console SQL | `docker compose exec postgres psql -U lebondeal -d lebondeal` |
| Version de démonstration (nginx) | `docker compose -f compose.prod.yaml up -d --build` puis http://localhost:8080 |

Les scripts d'initialisation des bases (`database/`) ne s'exécutent qu'au premier démarrage d'un volume vide : après les avoir modifiés, faire `docker compose down -v`.

## Mode hybride (bases dans Docker, code sur votre machine)

```bash
docker compose up -d --wait postgres mongo
cp backend/.env.example backend/.env
npm run dev
```

## Structure

```text
backend/       API Express (routes → contrôleurs → services → bases)
frontend/      application React
database/      scripts d'initialisation de PostgreSQL et de MongoDB
docs/          conception, plans d'implémentation
compose.yaml   environnement de développement
```

Détails, dépannage, sauvegardes : [`docs/lebondeal/04-docker.md`](docs/lebondeal/04-docker.md). Contrat de l'API : [`docs/lebondeal/05-backend.md`](docs/lebondeal/05-backend.md).
