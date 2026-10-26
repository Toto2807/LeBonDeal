# LeBonDeal — Conception du projet

**Date** : 2026-10-26 · **Statut** : validé par l'utilisateur le 2026-10-26 ; **phase 0 réalisée** (plan : `docs/superpowers/plans/2026-10-26-lebondeal-phase-0.md`) · **Langue** : français (comme le starter)

## 1. En bref

LeBonDeal est un site de petites annonces entre particuliers (déposer une annonce avec photos, chercher, contacter un vendeur), réalisé comme projet étudiant à partir du starter Full Stack JS du dépôt. Ce dossier décrit tout ce que je ferais côté front, SQL, NoSQL (MongoDB) et Docker, avec les fichiers et les commandes pour que tout se branche.

| | Choix |
|---|---|
| Frontend | React 19 + Vite 7 (déjà là) · React Router · TanStack Query · Tailwind CSS 4 · React Hook Form + zod · Leaflet · Socket.IO |
| Backend | Express 5 (déjà là) · `pg` sans ORM · Mongoose · zod · multer + sharp · Socket.IO |
| SQL | **PostgreSQL 17** : utilisateurs, catégories, annonces, photos, favoris, ventes, avis, signalements |
| NoSQL | **MongoDB 8** : champs propres à chaque catégorie, messagerie, notifications, statistiques |
| Docker | 4 services (`postgres`, `mongo`, `backend`, `frontend`), **une commande** : `docker compose watch` |

**Le principe des deux bases en une phrase** : PostgreSQL garde ce qui doit être exact et relié (qui, quoi, combien), MongoDB garde ce qui est flexible ou volumineux (les champs qui changent selon la catégorie, les messages, les événements). Une annonce = une ligne SQL + un document Mongo, reliés par son `uuid`.

**État** : le plan est écrit **et ses extraits ont été exécutés** sur votre machine (bases réelles, tests, build), dans une copie jetable hors du dépôt. **Le dépôt n'a pas été modifié.** Détail de ce qui est vérifié et de ce qui ne l'est pas : § 10.

### Les documents

| | Contenu | Ce que vous y trouvez |
|---|---|---|
| **01** [Frontend](../../lebondeal/01-frontend.md) | pages, maquettes, design, composants, recherche, dépôt, messagerie | 21 fichiers React et Vitest, compilés ; 5 tests |
| **02** [PostgreSQL](../../lebondeal/02-postgresql.md) | modèle, script complet, requêtes (recherche, rayon, bon prix) | schéma SQL + 3 requêtes testées |
| **03** [MongoDB](../../lebondeal/03-mongodb.md) | collections, validateurs, index, lien avec le SQL | script d'init, modèles, recherche en deux temps |
| **04** [Docker](../../lebondeal/04-docker.md) | fichiers, premier démarrage, commandes, dépannage | compose dev/prod, Dockerfiles, nginx |
| **05** [Backend](../../lebondeal/05-backend.md) | contrat d'API, authentification, photos, tests, seed | 35 fichiers Node (dont tests et seed), exécutés |

## 2. Ce qui existe déjà

Le dépôt contient le **starter Full Stack JS** du module (monorepo npm : `frontend/` React + Vite, `backend/` Express), avec déjà un début d'authentification (inscription, connexion, jeton JWT), un modèle `Task` et un test de santé. Docker n'y est pas prévu (le starter l'exclut explicitement de son périmètre).

Je garde l'organisation en couches (routes → contrôleurs → services → modèles), Express, Mongoose, JWT, `helmet`. Je remplace le code lié aux tâches (`Task`, `User` en Mongo) et je déplace les utilisateurs dans PostgreSQL.

**Défauts relevés dans le starter** (liste complète avec fichiers et lignes : document 05, § 3). Les trois plus importants :

1. **`cors` est importé mais absent de `backend/package.json`** : après `npm ci`, le backend ne démarre pas.
2. **La connexion est vulnérable à l'injection MongoDB** : le corps de la requête va tel quel dans `User.findOne({ email })`. Envoyer `"email": {"$ne": null}` fait chercher « n'importe quel utilisateur ». Elle plante aussi (erreur 500) sur un e-mail inconnu, et écrit le hash du mot de passe dans les journaux.
3. **`.gitignore` ne contient que `node_modules`** : un fichier `.env` avec des secrets pourrait être commité.

## 3. Le produit

**Pourquoi.** Un projet étudiant doit montrer qu'on sait construire un site complet et le raisonner (architecture, bases de données, sécurité, déploiement). Une place de marché de petites annonces fait travailler tous ces sujets avec un besoin que tout le monde comprend.

**Périmètre**

| Niveau | Fonctionnalités |
|---|---|
| **Indispensable** (MVP) | inscription / connexion · catégories · déposer une annonce avec photos et champs propres à la catégorie · recherche par texte, catégorie, prix, filtres de catégorie · fiche annonce · favoris · messagerie acheteur-vendeur · gérer mes annonces (modifier, supprimer, marquer vendue) |
| **Important** | profil vendeur et avis · recherche par distance · signalement d'annonces · modération (administrateur) |
| **Bonus** | alertes de recherche · carte · badge « bon prix » · offres dans le chat · tableau de bord vendeur · voir § 7 |

**Hors périmètre** : paiement réel, livraison, application mobile native, référencement (pas de rendu serveur), plusieurs langues. **Pas de copie de la marque ni des visuels de leboncoin** : nom, logo et couleurs de LeBonDeal sont propres.

**Ce qui serait un échec même si « ça marche »** : un site que seul son auteur sait lancer ; des secrets dans git ; un écran qui reste blanc si l'API répond une erreur ; la même information stockée à deux endroits sans règle pour la garder cohérente.

## 4. Architecture

```text
 Navigateur ──► http://localhost:5173  (Vite en dev · nginx en production)
                  │  /api  /uploads  /socket.io   (le navigateur ne connaît pas le backend)
                  ▼
            Backend Express 5  :3000
              ├──► PostgreSQL 17 :5432   (publié sur la machine en :5433)
              │      users · categories · ads · ad_images · favorites · transactions · reviews · reports
              └──► MongoDB 8 :27017
                     category_schemas · ad_details · conversations · messages
                     notifications · saved_searches · refresh_tokens · ad_views · search_events
```

**Règle d'or : une donnée a un seul foyer.** PostgreSQL décide de l'existence d'un utilisateur et d'une annonce. MongoDB ne fait que *référencer* leur `uuid` (en texte). Il n'y a pas de clé étrangère entre bases : le code garde la cohérence (document 03, § 7).

**Trois parcours qui montrent le fonctionnement**

1. *Déposer une annonce.* Le formulaire lit les champs de la catégorie (Mongo) → `POST /api/ads` → le backend revalide les champs avec la même définition (Mongo), ouvre une transaction SQL, insère l'annonce, écrit la fiche Mongo, valide. Si Mongo échoue, SQL annule : rien n'est écrit à moitié. Puis les photos : redimensionnées (1280 px et 400×300), enregistrées, référencées en SQL.
2. *Chercher.* `GET /api/ads?q=velo&category=velos&attr.type=VTT` → les filtres de catégorie vont à Mongo (liste d'identifiants), PostgreSQL applique texte, prix, distance, tri et pagination avec cette liste.
3. *Écrire au vendeur.* `POST /api/conversations` (retrouve ou crée) → `POST …/messages` (enregistré dans Mongo, aperçu et compteur de non-lus mis à jour) → le serveur pousse `message:new` en Socket.IO au destinataire.

## 5. Décisions que j'ai prises (à valider)

Vous n'avez pas précisé ces points : voici mes choix et ce qui change si vous préférez autre chose.

| Décision | Pourquoi | Si vous préférez autre chose |
|---|---|---|
| **PostgreSQL** pour le SQL | recherche française, distance, énumérations, index partiels intégrés ; 17 pour rester proche de ce qui est installé sur votre machine | MySQL/MariaDB : même modèle de tables, mais recherche et distance à réécrire |
| **Utilisateurs dans PostgreSQL**, plus dans Mongo comme le starter | ils sont reliés à presque toutes les tables relationnelles ; Mongo garde un rôle plus intéressant | tout garder dans Mongo : possible, mais perd les contraintes d'intégrité sur les avis |
| **`pg` sans ORM** | le starter n'utilise pas d'ORM ; du SQL lisible fait partie de ce qu'on veut montrer | Prisma / Drizzle : plus rapide à écrire, moins visible |
| **Champs propres à la catégorie dans MongoDB** | c'est le cas d'usage le plus naturel d'un schéma flexible ; le formulaire et les filtres en sont générés | colonne `jsonb` PostgreSQL (alternative à citer dans le rapport) |
| **Prix en centimes**, identifiants **uuid** | pas d'erreur d'arrondi ; identifiants non devinables, utilisables dans Mongo | — |
| **React Router, TanStack Query, Tailwind, React Hook Form** | voir document 01, § 2 | CSS pur du starter, `fetch` à la main : possible, plus long |
| **Jeton JWT** en en-tête, 7 jours, `localStorage` (phase 1), puis jeton court + cookie de rafraîchissement (phase 2) | simple pour démarrer, durci ensuite | rester sur 7 jours pour tout le projet |
| **Photos sur un volume Docker**, redimensionnées par `sharp` | aucun service externe | MinIO / S3 (document 04, § 10) |
| **`docker compose watch`** plutôt que des montages de dossiers | fiable sous Windows | montages classiques |
| **PostgreSQL publié sur le port 5433** | le port 5432 est pris par le PostgreSQL 18 installé sur Windows | arrêter ce service, ou autre port dans `.env` |
| **Images `node:24-alpine`** | même version que votre Node local (24.11) | `node:22-alpine` |
| **Données de démonstration via DummyJSON + faker** | réalistes, reproductibles ; les photos sont des liens externes | photos locales (plus lourd) |

## 6. Feuille de route

Cinq phases ; chaque phase se termine par un critère que l'on peut **vérifier**. Les tailles (S/M/L) sont relatives.

### Phase 0 — Fondations (S)

Créer les fichiers Docker et base de données (document 04), installer les dépendances, corriger le starter (document 05, § 3), brancher le squelette backend et le thème frontend.
**Terminé quand** : `docker compose watch` démarre quatre services sains ; `http://localhost:5173/api/health` répond `ok` ; `npm test` et `npm run test:integration` passent dans le conteneur ; `npm run seed` remplit les bases ; `.env` est ignoré par git.

### Phase 1 — Catalogue (L)

Backend : fiche annonce, modification, suppression, statut, gestion des photos, mes annonces. Frontend : accueil, recherche + filtres, fiche annonce, connexion / inscription, dépôt en 5 étapes, mes annonces.
**Terminé quand** : avec un compte du seed, on dépose une annonce « voiture » avec 3 photos et ses champs dynamiques, on la retrouve par recherche avec le filtre « Diesel », on la modifie et on la marque vendue ; un visiteur non connecté voit la fiche mais est invité à se connecter pour contacter.

### Phase 2 — Interaction (M)

Page des favoris, messagerie (REST + Socket.IO), signalement, jeton court + cookie de rafraîchissement.
**Terminé quand** : deux navigateurs (un acheteur, un vendeur) échangent des messages en direct, les compteurs de non-lus sont justes, les favoris persistent, et la session se renouvelle sans reconnexion.

### Phase 3 — Confiance (M)

Ventes et avis, profil vendeur, recherche par distance et carte, badge « bon prix », recherches sauvegardées, offres dans le chat.
**Terminé quand** : après avoir marqué une annonce vendue à un acheteur de la conversation, les deux peuvent laisser un avis (et un tiers ne peut pas) ; la note moyenne s'affiche sur le profil ; « à 30 km de Lyon » ne renvoie que des annonces proches.

### Phase 4 — Finitions (M)

Modération (administrateur), statistiques vendeur (vues par jour), tâche de réconciliation SQL ↔ Mongo, passe accessibilité et performance, test de bout en bout, `compose.prod.yaml`, README, schémas pour le rapport et la soutenance.
**Terminé quand** : en suivant le README sur une machine vierge, `docker compose -f compose.prod.yaml up -d --build` donne un site fonctionnel ; la liste de contrôle d'accessibilité est cochée ; un schéma « une annonce = une ligne SQL + un document Mongo » existe pour la soutenance.

### Organisation à plusieurs

Si vous êtes plusieurs, découpez par **piste** plutôt que par page, pour limiter les conflits : (1) infrastructure et tests, (2) API + PostgreSQL, (3) MongoDB + temps réel, (4) frontend catalogue (recherche, fiche, dépôt), (5) frontend compte (favoris, messagerie, profil). Une branche par fonctionnalité, des demandes de fusion petites, et `main` doit toujours démarrer avec `docker compose watch`. Tant que le contrat d'API (document 05, § 4) est respecté, le frontend et le backend avancent en parallèle.

## 7. Idées pour enrichir le projet

**Confiance et sécurité**
- Badge « bon prix » (déjà écrit en SQL : médiane de la catégorie) · score de confiance vendeur (avis, ancienneté, e-mail vérifié)
- Détection d'annonces en double avec `pg_trgm` · modération automatique (mots interdits) en plus du signalement
- Coordonnées arrondies publiquement, adresse exacte jamais exposée
- Vérification d'e-mail et « mot de passe oublié » avec **Mailpit** (faux serveur d'e-mails dans Docker)

**Découverte**
- Carte des annonces · recherche par rayon · « autour de moi »
- Recherches sauvegardées avec alerte quand une annonce correspondante apparaît (Mongo)
- Annonces similaires (même catégorie, prix proche, titre ressemblant) · suggestions de recherche issues des recherches populaires (Mongo)
- « Récemment consultées » (stockage local du navigateur)

**Transaction**
- Faire une offre de prix dans le chat (le message de type `offer` existe déjà dans le modèle) · statut « réservée »
- « Boost » payant **simulé** avec un fournisseur de paiement en mode test (jamais de vrai paiement)
- Remonter son annonce (une fois par jour) · expiration à 60 jours (déjà dans le schéma) avec relance planifiée

**Vendeur**
- Tableau de bord : vues par jour (agrégation Mongo déjà écrite), contacts, favoris · duplication d'annonce · export CSV

**Pour la soutenance**
- Application installable (PWA) · mode sombre · interface FR/EN · intégration continue (tests à chaque push) · test de bout en bout automatisé · mise en ligne sur un hébergeur de conteneurs
- Optionnel et hors périmètre : suggestion de titre / description / catégorie à partir des photos avec une API d'IA (clé et coût à prévoir)

## 8. Alimenter les bases en données

**Déjà prêt : `npm run seed`** (document 05, § 12). Il crée de façon reproductible 30 utilisateurs, ~214 annonces avec photos et champs dynamiques, des conversations, des ventes et des avis. Il vide d'abord les tables (développement seulement).

Sources utilisées ou testées, toutes gratuites et sans clé :

| Source | Contenu | Statut |
|---|---|---|
| [DummyJSON](https://dummyjson.com/products) | ~194 produits avec titres, descriptions, prix, photos | utilisée par le seed (fonctionne ; titres en anglais) |
| `@faker-js/faker` en français | noms, textes, nombres | utilisé par le seed |
| [picsum.photos](https://picsum.photos) | photos aléatoires stables (`/seed/<mot>/800/600`) | utilisée par le seed |
| [geo.api.gouv.fr](https://geo.api.gouv.fr) | toutes les communes de France, codes postaux, coordonnées, population | testée ; sert à la saisie de la ville ; le seed contient 20 villes en dur |
| [data.geopf.fr/geocodage](https://data.geopf.fr/geocodage/search/?q=paris) | adresses françaises | testée |

À envisager : récupérer les ~300 plus grandes communes depuis `geo.api.gouv.fr` pour répartir les annonces plus finement ; un jeu de données public de voitures d'occasion pour des prix plus réalistes (à chercher, non vérifié) ; des photos locales pour une démonstration hors ligne.

## 9. Qualité

- **Tests** : unitaires et d'intégration côté backend (13 écrits, passent), Vitest côté frontend (5 écrits, passent), un scénario de bout en bout en phase 4.
- **Définition de « terminé »** pour une fonctionnalité : elle marche avec `docker compose watch` ; elle a ses états chargement / vide / erreur ; un test couvre son cas principal ; l'accessibilité clavier est vérifiée ; la documentation du contrat d'API est à jour.
- **Sécurité** : liste de contrôle dans le document 05, § 10 (SQL paramétré, entrées validées, droits vérifiés sur chaque route, limitation de débit, secrets hors de git).
- **Sauvegardes** : commandes testées pour les deux bases (document 04, § 7).

## 10. Ce qui a été vérifié, et ce qui ne l'est pas

J'ai exécuté les extraits **pour de vrai**, dans une copie jetable du dépôt (hors du projet, supprimée ensuite), avec Docker sur votre machine :

| Zone | Vérifié |
|---|---|
| Docker | `compose config` (dev et prod) · quatre services sains · init SQL et Mongo · proxy Vite · rechargement automatique (`watch`, plusieurs modifications successives) · image de production (nginx, route React inconnue, utilisateur non-root) · `sharp` dans Alpine · sauvegarde et restauration des deux bases |
| PostgreSQL | schéma complet · recherche sans accent / catégorie parente / prix / rayon / faute de frappe · indicateur de prix · 7 contraintes qui doivent refuser · cascade · échange de positions de photos |
| MongoDB | init (utilisateur depuis l'environnement) · validateurs · 7 refus attendus · index unique, TTL, joker (`IXSCAN`) · requêtes de messagerie et de statistiques |
| Backend | 7 tests unitaires (Windows et Alpine) · 6 tests d'intégration réels dont le parcours HTTP complet · annulation SQL si Mongo échoue · injection d'opérateur Mongo neutralisée · seed rejoué deux fois · mode hybride depuis Windows |
| Frontend | `vite build` · compilation des fichiers non importés · 5 tests Vitest · installation sans conflit · appels réels à l'API à travers le proxy Vite · contrastes de couleur calculés |

**Non vérifié** (à garder en tête) :
- **Le rendu dans un navigateur** : aucune capture d'écran, les maquettes sont des schémas, pas un design validé. Le comportement réel de `FavoriteButton`, `FilterPanel`, `DynamicFields` et `useMessages` avec un utilisateur n'a pas été testé (ils compilent, parlent à la vraie API, mais n'ont pas de test de composant).
- Toutes les routes marquées « ⬜ » du contrat d'API, la messagerie de bout en bout (seul le module Socket.IO est testé), le rafraîchissement de jeton, Leaflet, l'adaptation mobile.
- La performance sur de gros volumes ; le délai réel de suppression des index TTL de Mongo.
- `docker compose up --watch` (je n'ai testé que `docker compose watch`, qui est équivalent), l'action `rebuild` de Watch, un déploiement sur un vrai serveur.
- Les liens de données hors de ceux du tableau du § 8.

## 11. Questions pour vous

1. **Le moteur SQL est-il imposé par votre cours ?** J'ai pris PostgreSQL ; si c'est MySQL/MariaDB, je réécris la recherche et la distance (le reste du modèle tient).
2. **Y a-t-il des contraintes de rendu** (date, soutenance, rapport, critères de notation, taille de l'équipe) qui changeraient les priorités des phases ?

## 12. Après votre validation

Je ne crée rien tant que vous n'avez pas validé. Ensuite : (1) je rédige le plan d'implémentation détaillé, tâche par tâche ; (2) je construis la **phase 0** (fichiers Docker, bases, correctifs du starter, squelette) et je la teste avec vous avant d'enchaîner ; (3) puis phase par phase, chacune finissant par son critère « terminé quand ».
