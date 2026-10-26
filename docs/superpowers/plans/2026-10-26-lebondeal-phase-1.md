# LeBonDeal — Phase 1 (Catalogue) : plan d'implémentation

> **Pour les agents :** exécuter tâche par tâche (`superpowers:executing-plans`). Les cases `- [ ]` suivent l'avancement.

**Objectif :** un visiteur trouve et consulte des annonces ; un utilisateur s'inscrit, dépose une annonce avec photos et champs de catégorie, la modifie, la marque vendue ou la supprime.

**Architecture :** on complète l'API de la phase 0 (lecture d'une annonce, modification, statut, photos, mes annonces), puis on construit les pages React qui la consomment. Les règles métier restent dans `adService` ; les contrôleurs valident avec zod ; le frontend passe par `api()` et TanStack Query.

**Stack :** inchangée (voir phase 0). Pas de nouvelle dépendance prévue.

**Spec :** `docs/superpowers/specs/2026-10-26-lebondeal-design.md` (§ 6, phase 1), contrat d'API `docs/lebondeal/05-backend.md` § 4, écrans `docs/lebondeal/01-frontend.md` §§ 4, 5, 8, 9, 10.

## Contraintes globales

- Mêmes contraintes que la phase 0 : français, prix en centimes, `camelCase` en JSON, SQL paramétré, pas d'ORM, tests écrits **avant** le code et vus échouer.
- Réponses `{ data }` / `{ data, meta }`, erreurs `{ error: { code, message, details? } }`.
- Statuts d'une annonce : `draft`, `active`, `reserved`, `sold`, `archived`, `deleted`. Transitions autorisées : `draft→active` · `active→reserved|sold|archived` · `reserved→active|sold|archived` · `archived→active`. `sold` et `deleted` sont définitifs.
- Une annonce `draft`, `archived` ou `deleted` n'est visible que de son propriétaire, **sauf `deleted` (404 pour tout le monde)**. `active`, `reserved` et `sold` sont publiques.
- Coordonnées publiées arrondies à 2 décimales (≈ 1 km) ; l'e-mail d'un vendeur n'apparaît jamais dans l'API publique.
- La catégorie d'une annonce ne peut pas être modifiée après création.
- Photos : 10 maximum, 8 Mo chacune, réordonnées par une transaction (contrainte `DEFERRABLE`).
- Contraste : texte sombre sur l'orange, jamais blanc (doc 01 § 6) ; chaque page a ses états chargement / vide / erreur.
- **Aucun commit tant que l'utilisateur ne le demande pas** ; travail sur la branche `phase-1-catalogue`.
- Le port 5173 est pris par un autre projet : `.env` local à `FRONTEND_PORT=5174`.

## Points de vigilance (Review Focus)

1. **Annonce non publique lue par un anonyme ou un tiers** (brouillon, archivée, supprimée) : réponse 404, jamais 403, pour ne pas révéler son existence — Tâche 1.
2. **Modifier ou supprimer l'annonce d'un autre** (statut, photos, modification) : 403 sur chaque route d'écriture, y compris `images/order` — Tâches 2 et 3.
3. **Vendre deux fois, revenir en arrière, se vendre à soi-même** : transitions invalides refusées (409), acheteur = vendeur refusé (400), aucune ligne `transactions` en double — Tâche 2.
4. **Ordre des photos invalide** (identifiant manquant, en double, d'une autre annonce) : refusé en bloc, ordre inchangé — Tâche 3.
5. **Prix saisi à la française** (`12,50`, `1 200`, `-5`, `abc`) et **photos qui échouent après la création** : centimes exacts ou refus ; l'annonce déjà créée n'est ni perdue ni dupliquée — Tâches 4 et 7.

---

### Tâche 1 : Lire une annonce, lister mes annonces (API)

**Fichiers**
- Modifier : `backend/src/middlewares/requireAuth.js` (ajouter `optionalAuth`), `backend/src/services/adService.js`, `backend/src/controllers/adController.js`, `backend/src/routes/adRoutes.js`, `backend/src/schemas/adSchemas.js`, `backend/src/app.js`
- Créer : `backend/src/controllers/userController.js`, `backend/src/routes/userRoutes.js`
- Test : `backend/test/integration/ads.read.integration.test.js`

**Interfaces**
- Produit : `optionalAuth(req, res, next)` (pose `req.user` si le jeton est valide, ignore un jeton absent ou invalide) · `getAd(adId: string, viewerId: string | null): Promise<AdDetail>` · `listMyAds(userId, { status?, page, limit }): Promise<{ items, total }>` · `GET /api/ads/:id` · `GET /api/users/me/ads`.
- `AdDetail` = `{ id, title, description, priceCents, itemCondition, status, city, postalCode, lat, lng, shippingAvailable, publishedAt, category: { id, slug, name, parent: { slug, name } }, images: [{ id, url, thumbUrl, position }], attributes, seller: { id, displayName, avatarUrl, memberSince, ratingAvg, ratingCount, activeAdsCount }, priceHint }`. `priceHint` ∈ `unknown | good_deal | fair | high` (fichier `sql/price-hint.sql`). `ratingAvg` est `null` sans avis.

- [x] **Étape 1 : écrire les tests** (intégration, vraies bases)
  - `GET /api/ads/:id` anonyme sur une annonce active → 200 avec toutes les clés de `AdDetail` ; `lat` arrondie à 2 décimales ; `images` triées par `position` ; `seller` sans `email` ; `priceHint` dans l'ensemble autorisé.
  - id non-uuid → 400 `VALIDATION` ; uuid inconnu → 404 `AD_NOT_FOUND`.
  - brouillon (statut forcé en SQL) : anonyme 404, autre utilisateur 404, propriétaire 200 ; annonce `deleted` : 404 même pour le propriétaire ; annonce `sold` : 200 pour tous avec `status: 'sold'`.
  - `GET /api/users/me/ads` : 401 sans jeton ; renvoie les annonces du propriétaire hors `deleted`, `?status=sold` filtre, `meta` `{ total, page, limit }`, `?status=nimporte` → 400.
- [x] **Étape 2 : lancer** `npm run test:integration -w backend` (bases démarrées, mode hybride) → échec (routes absentes : 404 au lieu de 200).
- [x] **Étape 3 : implémenter** `getAd` (jointure catégorie + parent, photos, fiche `AdDetails` de Mongo, `v_seller_stats`, comptage des annonces actives, `price-hint.sql`) et `listMyAds` (vue `v_ad_cards`, filtre propriétaire, pagination) ; brancher routes et `optionalAuth` ; `userRouter` monté sur `/api/users`.
- [x] **Étape 4 : relancer** → tests de la tâche et tests existants verts.

### Tâche 2 : Modifier, supprimer, changer le statut (API)

**Fichiers**
- Modifier : `backend/src/services/adService.js`, `controllers/adController.js`, `routes/adRoutes.js`, `schemas/adSchemas.js`
- Test : `backend/test/integration/ads.write.integration.test.js`

**Interfaces**
- Consomme : `getAd` (Tâche 1) pour relire le résultat.
- Produit : `updateAd(userId, adId, patch): Promise<Ad>` · `deleteAd(userId, adId): Promise<void>` · `changeStatus(userId, adId, { status, buyerId? }): Promise<Ad>` · `PATCH /api/ads/:id` · `DELETE /api/ads/:id` (204) · `PATCH /api/ads/:id/status`. Codes d'erreur ajoutés : `AD_NOT_EDITABLE` (409), `INVALID_TRANSITION` (409).
- `updateAdSchema` : `title, description, priceCents, itemCondition, city, postalCode, lat, lng, shippingAvailable, attributes`, tous facultatifs, au moins un, **strict** (`categorySlug` ou champ inconnu → 400).

- [x] **Étape 1 : écrire les tests**
  - modification par le propriétaire (titre, prix) → 200 ; la recherche trouve le nouveau titre (colonne `search_vector` régénérée) ; `updatedAt` a avancé.
  - `attributes` valides → fiche Mongo mise à jour ; `carburant: 'Vapeur'` envoyé avec un nouveau prix → 400 et **le prix n'a pas changé** (atomicité).
  - autre utilisateur → 403 ; sans jeton → 401 ; id inconnu → 404 ; annonce `sold` → 409 `AD_NOT_EDITABLE`.
  - `DELETE` par le propriétaire → 204, puis `GET` → 404 et la recherche ne la renvoie plus ; autre utilisateur → 403.
  - statuts : `active→reserved→active`, `active→archived→active` (`publishedAt` avance à la republication), `active→sold` avec `buyerId` valide → une ligne `transactions` (`priceCents` = prix de l'annonce) ; `active→sold` sans `buyerId` → accepté, aucune ligne ; `sold→active` et `sold→sold` → 409 `INVALID_TRANSITION` ; `buyerId` = vendeur → 400 ; `buyerId` inconnu → 400 `INVALID_REFERENCE` ; `status: 'deleted'` → 400 `VALIDATION` ; autre utilisateur → 403.
- [x] **Étape 2 : lancer** → échec (routes absentes).
- [x] **Étape 3 : implémenter** les trois fonctions ; colonnes modifiables issues d'une **liste blanche** (jamais de nom de colonne venu du client) ; modification SQL + Mongo dans une transaction (même schéma que `createAd`) ; table des transitions en constante.
- [x] **Étape 4 : relancer** → tout vert.

### Tâche 3 : Gérer les photos d'une annonce (API)

**Fichiers**
- Modifier : `backend/src/services/adService.js`, `controllers/adController.js`, `routes/adRoutes.js`, `schemas/adSchemas.js`
- Test : `backend/test/integration/ads.images.integration.test.js`

**Interfaces**
- Produit : `removeImage(userId, adId, imageId): Promise<void>` · `reorderImages(userId, adId, ids: string[]): Promise<Image[]>` · `DELETE /api/ads/:id/images/:imageId` (204) · `PATCH /api/ads/:id/images/order` body `{ ids }` → `data` = photos dans le nouvel ordre. Codes : `IMAGE_NOT_FOUND` (404), `INVALID_ORDER` (400).

- [x] **Étape 1 : écrire les tests** (3 vraies photos envoyées par la route existante)
  - suppression de la photo du milieu → 204 ; les fichiers (`url` et `thumbUrl`) ont disparu du dossier d'envoi ; les `position` restantes valent 0 et 1.
  - image inconnue ou d'une autre annonce → 404 ; autre utilisateur → 403.
  - ordre inversé valide → 200, relecture dans le nouvel ordre ; positions toujours uniques.
  - ordre invalide (id manquant, doublon, id d'une autre annonce, id en trop) → 400 `INVALID_ORDER` et ordre **inchangé** ; autre utilisateur → 403.
- [x] **Étape 2 : lancer** → échec. **Étape 3 : implémenter** (réordonnancement en une transaction grâce à `UNIQUE … DEFERRABLE INITIALLY DEFERRED` ; fichiers supprimés après le `COMMIT`, une erreur de suppression de fichier est journalisée sans faire échouer la requête). **Étape 4 : relancer** → vert.

### Tâche 4 : Fondations frontend, connexion et inscription

**Fichiers**
- Créer : `frontend/src/lib/money.js`, `hooks/usePageTitle.js`, `components/ui/{Button,Skeleton,Pagination,ConfirmDialog}.jsx`, `test/render.jsx` (aide : routeur + QueryClient), `pages/Login.jsx`, `pages/Register.jsx` (remplacent les pages provisoires)
- Modifier : `frontend/src/api/client.js` (`setUnauthorizedHandler`), `context/AuthContext.jsx`, `pages/Search.jsx` (utilise `Pagination`), `pages/account/Profile.jsx` (provisoire annoncé en phase 2)
- Tests : `lib/money.test.js`, `api/client.test.js`, `components/ui/*.test.jsx`, `pages/Login.test.jsx`, `pages/Register.test.jsx`, `hooks/usePageTitle.test.jsx`

**Interfaces**
- Produit : `eurosToCents(input: string | number): number | null` (virgule ou point, espaces et espaces insécables ignorés, `null` si vide, négatif, non numérique ou plus de 2 décimales) · `centsToEuros(cents: number): string` (`1250 → '12,50'`, `15000 → '150'`) · `usePageTitle(title: string): void` (→ `"<title> · LeBonDeal"`) · `setUnauthorizedHandler(fn | null): void` (appelé quand une réponse 401 de code `TOKEN_INVALID` ou `TOKEN_MISSING` arrive alors qu'un jeton est défini ; **pas** pour `INVALID_CREDENTIALS`) · `<Pagination page pageCount onPage />` · `<ConfirmDialog open title message confirmLabel onConfirm onCancel />` · `<Button variant="primary|secondary|danger|ghost" loading />` · `<Skeleton className />`.

- [x] **Étape 1 : écrire les tests** : `eurosToCents('12,50')=1250`, `('12.5')=1250`, `(' 1 200 ')=120000`, `('19,99')=1999`, `(12)=1200`, `('')`, `('-5')`, `('abc')`, `('12,999')` → `null` ; `centsToEuros` ; le gestionnaire 401 (appelé pour `TOKEN_INVALID`, jamais pour `INVALID_CREDENTIALS`) ; `Pagination` (boutons désactivés aux bornes, appelle `onPage`) ; `ConfirmDialog` (confirmer / annuler) ; `Login` (mauvais identifiants → message « E-mail ou mot de passe incorrect », succès → redirection vers la page d'origine ou `/`, utilisateur déjà connecté → redirigé) ; `Register` (mot de passe de moins de 8 caractères refusé avant tout appel réseau, e-mail déjà pris → « Cette adresse e-mail est déjà utilisée », succès → inscription puis connexion automatique) ; `usePageTitle`.
- [x] **Étape 2 : lancer** `npm test -w frontend` → échec (modules absents).
- [x] **Étape 3 : implémenter** (formulaires React Hook Form + zod via `@hookform/resolvers/zod` ; erreurs de champ sous le champ avec `role="alert"`, `autocomplete` renseigné).
- [x] **Étape 4 : relancer** → vert ; `npm run build` OK.

### Tâche 5 : Accueil et grille d'annonces

**Fichiers**
- Créer : `frontend/src/components/ads/{AdGrid,CategoryGrid}.jsx`, `lib/categoryIcons.js`
- Modifier : `pages/Home.jsx`, `pages/Search.jsx` (utilise `AdGrid`)
- Tests : `components/ads/AdGrid.test.jsx`, `components/ads/CategoryGrid.test.jsx`, `pages/Home.test.jsx`

**Interfaces**
- Consomme : `useCategories`, `AdCard`, `Skeleton`, `api()`.
- Produit : `<AdGrid ads loading emptyMessage />` (squelettes pendant le chargement, message si vide) · `<CategoryGrid categories />` (un lien `/recherche?category=<slug>` par catégorie racine) · `categoryIcon(name: string): LucideIcon` (`car`, `house`, `smartphone`, `sofa`, `shirt`, `gamepad-2` ; icône par défaut sinon).

- [x] **Étape 1 : écrire les tests** : `AdGrid` (8 squelettes en chargement ; message personnalisé si vide ; une carte par annonce) ; `CategoryGrid` (6 liens avec la bonne adresse) ; `Home` (titre, catégories, annonces récentes issues d'un `api` simulé, message d'erreur lisible si l'API échoue, champ de recherche qui mène à `/recherche?q=…`).
- [x] **Étape 2 : lancer** → échec. **Étape 3 : implémenter**. **Étape 4 : relancer** → vert, y compris le routage existant (`App.test.jsx`).

### Tâche 6 : Fiche annonce

**Fichiers**
- Créer : `frontend/src/hooks/useAd.js`, `components/ads/{Gallery,PriceHint,SellerCard,AdAttributes}.jsx`
- Modifier : `pages/AdDetail.jsx` (remplace la page provisoire)
- Tests : `components/ads/Gallery.test.jsx`, `components/ads/AdAttributes.test.jsx`, `pages/AdDetail.test.jsx`

**Interfaces**
- Consomme : `GET /api/ads/:id` (`AdDetail`, Tâche 1), `useCategorySchema`, `FavoriteButton`, `formatPrice`, `timeAgo`, `usePageTitle`.
- Produit : `useAd(id): UseQueryResult<AdDetail>` (clé `['ad', id]`) · `<Gallery images title />` (image principale + miniatures, changement par clic ou clavier, texte alternatif) · `<AdAttributes attributes fields />` (libellé et unité issus de la définition de catégorie ; valeur brute si le champ n'est plus défini) · `<PriceHint hint />` (rien si `unknown`) · `<SellerCard seller />` (« Pas encore d'avis » sans note).

- [x] **Étape 1 : écrire les tests** : `Gallery` (cliquer une miniature change l'image principale ; zéro photo → emplacement « Pas de photo ») ; `AdAttributes` (« Kilométrage : 80 000 km ») ; `AdDetail` : chargement, contenu (titre, prix formaté, description, ville, caractéristiques), bandeau « Vendue » / « Réservée », 404 de l'API → page « Annonce introuvable », **visiteur anonyme → lien « Se connecter pour contacter le vendeur » vers `/connexion` avec la page d'origine**, connecté non propriétaire → bouton « Contacter le vendeur » (vers la messagerie), propriétaire → lien « Modifier mon annonce » vers `/annonces/:id/modifier`.
- [x] **Étape 2 : lancer** → échec. **Étape 3 : implémenter**. **Étape 4 : relancer** → vert.

### Tâche 7 : Déposer une annonce

**Fichiers**
- Créer : `frontend/src/lib/{geo,adForm}.js`, `hooks/useDraft.js`, `components/forms/{CityPicker,ImageUploader,Stepper}.jsx`
- Modifier : `pages/PostAd.jsx` (remplace la page provisoire ; création **et** modification, mode modification en Tâche 8)
- Tests : `lib/geo.test.js`, `lib/adForm.test.js`, `hooks/useDraft.test.jsx`, `components/forms/CityPicker.test.jsx`, `components/forms/ImageUploader.test.jsx`, `pages/PostAd.test.jsx`

**Interfaces**
- Consomme : `useCategories`, `useCategorySchema`, `DynamicFields`, `eurosToCents`, `api()`.
- Produit : `searchCommunes(query: string, signal?: AbortSignal): Promise<Place[]>` avec `Place = { city, postalCodes: string[], lat, lng }` (appelle `https://geo.api.gouv.fr/communes?nom=…&fields=nom,codesPostaux,centre&boost=population&limit=5` ; **`centre.coordinates` est `[longitude, latitude]`**) · `<CityPicker value onChange />` (saisie différée de 250 ms, réponse périmée ignorée) · `<ImageUploader files onChange max={10} />` (refuse hors JPEG/PNG/WebP et > 8 Mo avec message, monter / descendre / retirer) · `useDraft(key): { load(), save(values), clear() }` (ignore un JSON corrompu) · `toCreatePayload(values): CreateAdBody` (prix en centimes, `attributes` limités aux champs de la définition, nombres convertis) · `<Stepper steps current />`.
- `PostAd` en 5 étapes : catégorie · détails (+ champs dynamiques) · photos · prix et lieu · récapitulatif. Publication : `POST /api/ads` puis `POST /api/ads/:id/images` (`FormData`, champ `photos`).

- [x] **Étape 1 : écrire les tests** : `searchCommunes` convertit `[4.8351, 45.758]` en `lat: 45.758, lng: 4.8351` ; `CityPicker` (deux frappes rapides → un seul appel ; une réponse arrivée en retard après une frappe plus récente est ignorée) ; `ImageUploader` (11e fichier refusé, `.pdf` refusé, fichier de 9 Mo refusé, ordre modifié) ; `useDraft` ; `toCreatePayload('12,50') → 1250`, attributs étrangers à la catégorie écartés ; `PostAd` (impossible de passer à l'étape suivante sans titre ni catégorie, messages sous les champs ; publication nominale : un `POST /ads` puis un `POST` de photos avec `FormData` ; **échec du téléversement des photos : message « Annonce créée, mais les photos n'ont pas pu être envoyées » avec lien vers la modification, et `POST /ads` n'est appelé qu'une seule fois**).
- [x] **Étape 2 : lancer** → échec. **Étape 3 : implémenter** (brouillon enregistré à chaque étape, effacé après publication). **Étape 4 : relancer** → vert.

### Tâche 8 : Modifier une annonce et « Mes annonces »

**Fichiers**
- Créer : `frontend/src/components/ads/ExistingImages.jsx`, `hooks/useMyAds.js`
- Modifier : `pages/PostAd.jsx` (mode modification), `pages/account/MyAds.jsx`, `pages/account/AccountLayout.jsx` (menu : annonces, favoris, messages, profil)
- Tests : `pages/PostAd.edit.test.jsx`, `components/ads/ExistingImages.test.jsx`, `pages/account/MyAds.test.jsx`

**Interfaces**
- Consomme : API des Tâches 1 à 3, `ConfirmDialog`, `Pagination`, `Button`.
- Produit : `useMyAds({ status, page }): UseQueryResult<{ data, meta }>` (clé `['my-ads', status, page]`) · `<ExistingImages adId images />` (retirer et réordonner appellent l'API immédiatement) · en modification, l'étape « catégorie » est omise et la catégorie affichée en lecture seule.

- [x] **Étape 1 : écrire les tests** : modification (champs préremplis, enregistrement par `PATCH /api/ads/:id`, suppression d'une photo existante → `DELETE`) ; `MyAds` (liste, onglets Toutes / Actives / Réservées / Vendues / Archivées qui changent le paramètre `status`, état vide, **suppression : aucune requête avant confirmation, `DELETE` après confirmation puis liste rechargée**, « Marquer comme vendue » → `PATCH …/status` avec `{ status: 'sold' }`, « Archiver » / « Republier »).
- [x] **Étape 2 : lancer** → échec. **Étape 3 : implémenter**. **Étape 4 : relancer** → vert ; `npm run build` OK.

### Tâche 9 : Recette de la phase 1 dans un vrai navigateur

**Fichiers**
- Modifier : `README.md` (état du projet), `docs/superpowers/specs/2026-10-26-lebondeal-design.md` (statut), `docs/lebondeal/05-backend.md` (routes passées de ⬜ à ✅)

- [x] **Étape 1 : toute la suite** — `docker compose exec backend npm test` et `npm run test:integration` ; `npm test -w frontend` ; `npm run build` ; `npm ci --dry-run`. Tout vert, sortie sans avertissement.
- [x] **Étape 2 : démarrer** — `docker compose watch` (port frontend 5174), `docker compose exec backend npm run seed`.
- [x] **Étape 3 : recette dans le navigateur intégré, scénario du critère « terminé quand »** :
  1. visiteur non connecté : ouvrir l'accueil, une catégorie, une fiche annonce ; la fiche propose « Se connecter pour contacter le vendeur » ;
  2. se connecter avec `user1@lebondeal.test` / `password123` (compte du seed) ;
  3. déposer une annonce « Voiture » avec 3 photos et ses champs (marque, modèle, année, kilométrage, carburant Diesel) ;
  4. la retrouver par la recherche avec le filtre « Diesel » ;
  5. la modifier (prix), retirer puis réordonner une photo ;
  6. la marquer vendue ; elle disparaît de la recherche mais sa fiche reste visible ;
  7. en créer une seconde et la supprimer depuis « Mes annonces ».
  Pour chaque écran : capture, console du navigateur sans erreur.
- [x] **Étape 4 : mobile** — rejouer l'accueil, la recherche et le dépôt en largeur 375 px : pas de défilement horizontal.
- [x] **Étape 5 : bilan** — arrêter la pile, `git status` ne montre que des fichiers attendus ; mettre à jour les documents listés.

---

## Auto-relecture

- **Couverture du critère de la phase 1** : annonce « voiture » avec 3 photos et champs dynamiques (T7) · retrouvée par recherche + « Diesel » (existant, T9) · modifiée (T2, T8) · marquée vendue (T2, T8) · visiteur invité à se connecter (T6) · inscription / connexion (T4) · accueil (T5) · mes annonces (T8) · photos gérées (T3, T8).
- **Cohérence** : `AdDetail` défini en T1 et consommé en T6 et T8 ; `eurosToCents` défini en T4 et utilisé en T7 ; `Pagination` et `ConfirmDialog` en T4, utilisés en T5 et T8 ; les codes d'erreur de T2 et T3 sont ceux que l'interface de T7 et T8 traduit en messages.
- **Hors périmètre rappelé** : favoris (page), messagerie, signalement, avis, profil, carte, géolocalisation « autour de moi » → phases 2 et 3. Le bouton « Contacter » mène à la page provisoire de messagerie.

---

## Bilan de l'exécution (2026-10-26)

- **Résultat** : 9 tests unitaires et 30 tests d'intégration côté backend, 259 tests côté frontend (36 fichiers), `vite build` et `npm ci --dry-run` sans erreur. Le scénario du critère « terminé quand » a été rejoué à la main dans le navigateur intégré (frontend sur le port **5173**, finalement libéré par l'arrêt de l'autre projet qui l'occupait ; l'étape 2 prévoyait 5174).
- **Corrigé à la suite de la recette** : cibles tactiles de 44 px (en-tête, cœur des favoris), nom accessible du lien « Mon compte » sur mobile, `aria-invalid` / `aria-describedby` sur les champs de la catégorie, focus sur le premier champ invalide, récapitulatif du dépôt qui affiche « 80 000 km » comme la fiche, focus du titre d'étape qui ne se déclenche plus à l'ouverture en mode développement (StrictMode), clic sur le cœur avant la fin du chargement de la liste des favoris. En refaisant la mesure à 375 px, l'en-tête débordait : il passe sur deux lignes (logo + navigation, puis recherche + bouton « Déposer », désormais accessible aussi sur téléphone).
- **Écarts assumés** : aucun commit de la phase 1 pour l'instant (rien n'a été demandé) ; `docker compose up --watch` n'a pas été essayé (seulement `watch` ; la synchronisation ne copie que les fichiers modifiés après son démarrage) ; les fins de ligne ne sont pas normalisées (`core.autocrlf` / `.gitattributes` à décider avec l'équipe).
