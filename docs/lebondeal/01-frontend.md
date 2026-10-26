# LeBonDeal — Frontend : tout ce que je ferais

> Partie 1/5 du dossier de conception. Vue d'ensemble : [`2026-10-26-lebondeal-design.md`](../superpowers/specs/2026-10-26-lebondeal-design.md). Données consommées : [05 — Backend](05-backend.md) (contrat d'API).
> Le code de ce document compile (`vite build`), ses tests passent (`vitest`), et il dialogue avec le vrai backend. Il n'a **pas** été affiché dans un navigateur : les maquettes et le rendu restent à valider à l'écran (voir § 17).

## 1. Ce que doit permettre le site

Pour un **visiteur** : trouver une annonce vite (texte, catégorie, prix, distance, filtres propres à la catégorie), voir une annonce en détail, contacter le vendeur après s'être connecté.
Pour un **vendeur** : déposer une annonce en moins de deux minutes depuis un téléphone, avec des photos, la suivre, la marquer vendue.
Pour tous : un site rapide, lisible au clavier, utilisable à une main sur mobile (la majorité des usages d'une petite-annonce).

Ce que le site ne fait pas : paiement en ligne réel, livraison, copie de la marque ou des visuels de leboncoin (nom, logo et couleurs sont propres à LeBonDeal).

## 2. La stack, et pourquoi

Le starter fournit déjà React 19 et Vite 7. Ce que j'ajoute, chaque choix étant **ma décision, modifiable** :

| Besoin | Choix | Pourquoi | Alternative |
|---|---|---|---|
| Pages et navigation | **React Router** (`react-router`, mode déclaratif : `BrowserRouter`, `Routes`) | standard, URL partageables | TanStack Router |
| Données du serveur | **TanStack Query** | cache, rechargement, mises à jour optimistes (favoris), pagination ; évite des centaines de lignes de `useEffect` | `fetch` + `useState` à la main |
| Style | **Tailwind CSS 4** (plugin Vite) | très rapide à écrire, cohérent, léger après compilation | CSS modules, CSS pur (celui du starter) |
| Formulaires | **React Hook Form** + **zod** | formulaire de dépôt long et conditionnel ; validation partagée | formulaires contrôlés à la main |
| Icônes | **lucide-react** | icônes SVG, chargées une par une | — |
| Notifications | **sonner** | « Annonce publiée », « Erreur réseau » | — |
| Carte | **Leaflet** + **react-leaflet** | gratuit, sans clé d'API (tuiles OpenStreetMap) | Google Maps (clé et carte bancaire) |
| Temps réel | **socket.io-client** | messagerie instantanée ; reconnexion automatique | WebSocket natif |
| Tests | **Vitest** + **Testing Library** | même configuration que Vite | Jest |

Versions installées lors des vérifications : react-router 8.5, @tanstack/react-query 5.105, tailwindcss 4.3, react-hook-form 7.91, zod 4.6, vitest 5.0, lucide-react 1.61, socket.io-client 4.8.

> ⚠ `@hookform/resolvers` doit être installé en **`^5`**. La version 6.0.0 fait échouer `npm install` (`ERESOLVE`, conflit sur des dépendances optionnelles). La commande d'installation complète est dans le document 04, § 4.

## 3. Arborescence

```text
frontend/src/
├─ main.jsx                  point d'entrée : QueryClient, Router, AuthProvider, Toaster
├─ App.jsx                   table des routes (pages chargées à la demande)
├─ index.css                 Tailwind + thème (couleurs de marque)
├─ api/client.js             le seul endroit qui appelle fetch
├─ context/AuthContext.jsx   utilisateur connecté, login, logout
├─ routes/ProtectedRoute.jsx pages réservées aux connectés (ou à un rôle)
├─ hooks/                    useAdSearch · useCategories · useMessages  (+ à venir : useGeolocation, useDebounce)
├─ lib/                      format.js (prix, dates) · socket.js
├─ components/
│  ├─ Layout, Header, Footer
│  ├─ ads/                   AdCard · FavoriteButton · FilterPanel  (+ à venir : AdGrid, Gallery, PriceHint, SellerCard)
│  ├─ forms/                 DynamicFields  (+ à venir : ImageUploader, CityPicker, Stepper)
│  ├─ chat/                  (à venir : ConversationList, ChatWindow, MessageBubble)
│  └─ ui/                    (à venir : Button, Modal, Skeleton, EmptyState, Pagination)
└─ pages/
   ├─ Home · Search · AdDetail · SellerProfile · Login · Register · PostAd · NotFound
   └─ account/               AccountLayout · MyAds · Favorites · Messages · Profile
```

## 4. Les écrans

| Route | Page | Accès | Données (API) | États à prévoir |
|---|---|---|---|---|
| `/` | Accueil | public | `GET /api/categories`, `GET /api/ads?limit=8` | chargement (squelettes), vide |
| `/recherche` | Résultats + filtres | public | `GET /api/ads` (filtres dans l'URL), `GET /api/categories/:slug/schema` | chargement, **aucun résultat**, erreur réseau, page suivante |
| `/annonces/:id` | Fiche annonce | public | `GET /api/ads/:id` | introuvable (404), annonce vendue/archivée |
| `/vendeur/:id` | Profil vendeur | public | `GET /api/users/:id`, `…/ads`, `…/reviews` | aucun avis |
| `/connexion`, `/inscription` | Authentification | public (redirige si connecté) | `POST /api/auth/*` | erreurs de champ, compte suspendu |
| `/deposer`, `/annonces/:id/modifier` | Dépôt / modification | connecté | `POST/PATCH /api/ads`, photos | brouillon, échec d'envoi des photos |
| `/compte` | Mes annonces | connecté | `GET /api/users/me/ads` | aucune annonce |
| `/compte/favoris` | Favoris | connecté | `GET /api/favorites` | aucun favori |
| `/compte/messages/:conversationId?` | Messagerie | connecté | `GET /api/conversations`, messages, Socket.IO | aucune conversation, hors ligne |
| `/compte/profil` | Profil | connecté | `PATCH /api/users/me` | — |
| `/admin/*` | Modération | administrateur | `GET /api/admin/*` | — |
| `*` | 404 | public | — | — |

Chaque page a **quatre états** à dessiner, pas seulement « les données sont là » : chargement, vide, erreur, succès. C'est ce qui sépare un projet étudiant d'un site utilisable.

## 5. Maquettes

Schémas de principe (la mise en forme finale se règle à l'écran). Mobile d'abord : à partir de 1024 px, les filtres passent en colonne de gauche.

**Accueil**

```text
┌────────────────────────────────────────────────────────────────┐
│ LeBonDeal   [+ Déposer une annonce]  [ Que recherchez-vous ? ]  ♡  ✉  Marie │
├────────────────────────────────────────────────────────────────┤
│        Trouvez la bonne affaire près de chez vous              │
│   [ Que cherchez-vous ?        ] [ Où ? Ville ▾ ] [Rechercher] │
├────────────────────────────────────────────────────────────────┤
│  (Véhicules) (Immobilier) (Multimédia) (Maison) (Mode) (Loisirs)│
├────────────────────────────────────────────────────────────────┤
│  Dernières annonces                              Voir tout ›   │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                           │
│  │photo │ │photo │ │photo │ │photo │                           │
│  │Titre │ │Titre │ │Titre │ │Titre │                           │
│  │120 € │ │ 35 € │ │ 8 500│ │ 60 € │                           │
│  │Lyon  │ │Paris │ │Nantes│ │Lille │                           │
│  └──────┘ └──────┘ └──────┘ └──────┘                           │
├────────────────────────────────────────────────────────────────┤
│ À propos · Aide · Conditions · Mentions légales                │
└────────────────────────────────────────────────────────────────┘
```

**Recherche**

```text
┌─────────────────┬──────────────────────────────────────────────┐
│ FILTRES         │  214 annonces pour « velo »                  │
│ Catégorie ▾     │  Trier par: Plus récentes ▾     [Liste|Carte]│
│ Prix  [min][max]│  ┌──────┐ ┌──────┐ ┌──────┐                  │
│ Autour de moi   │  │ ♡    │ │ ♡    │ │ ♡    │                  │
│  Lyon ▾ 30 km   │  │photo │ │photo │ │photo │                  │
│ ── selon la ──  │  │Titre │ │Titre │ │Titre │                  │
│ catégorie (Mongo)│ │150 € │ │ 90 € │ │230 € │                  │
│ Type: ☑VTT ☐Ville│ │Lyon·1km│ ...                            │
│ Taille: ☐S ☑M    │  └──────┘ └──────┘ └──────┘                  │
│ [Réinitialiser]  │   ‹ Précédent    Page 2 sur 11    Suivant › │
└─────────────────┴──────────────────────────────────────────────┘
```

**Fiche annonce**

```text
┌──────────────────────────────────────┬───────────────────────────┐
│  ┌────────────────────────────────┐  │ Vélo de ville Peugeot     │
│  │      photo principale          │  │ 150 €      [bon prix]     │
│  └────────────────────────────────┘  │ Lyon 69003 · il y a 2 j   │
│  ▫ ▫ ▫ ▫ ▫  (miniatures)             │ ┌───────────────────────┐ │
│                                      │ │ Marie · ★ 4,8 (12 avis)│ │
│  Description                         │ │ [Contacter le vendeur] │ │
│  ...                                 │ │ [Faire une offre]      │ │
│  Caractéristiques (champs Mongo)     │ │ ♡ Favori   ⚑ Signaler  │ │
│  Type: VTT · Taille: M               │ └───────────────────────┘ │
│  Carte (zone approximative)          │ Annonces similaires       │
└──────────────────────────────────────┴───────────────────────────┘
```

**Dépôt d'annonce** (5 étapes, une seule colonne, barre de progression)

```text
 ① Catégorie ─ ② Détails ─ ③ Photos ─ ④ Prix et lieu ─ ⑤ Récapitulatif
 ┌─────────────────────────────────────────────────────────────┐
 │ ② Détails                                                   │
 │ Titre *            [______________________________]         │
 │ Description *      [______________________________]         │
 │ État               [Bon état ▾]                              │
 │ ── champs de la catégorie « Voitures » (depuis MongoDB) ──  │
 │ Marque * [Peugeot ▾]  Modèle * [208]  Année * [2019]        │
 │ Kilométrage (km) * [80000]   Carburant * [Diesel ▾]         │
 │                                    [‹ Retour]  [Continuer ›]│
 └─────────────────────────────────────────────────────────────┘
```

**Messagerie** (deux colonnes sur ordinateur ; liste puis conversation sur mobile)

```text
┌───────────────────────┬──────────────────────────────────────┐
│ Conversations         │ Peugeot 208 · 8 500 €   (Paul)       │
│ ● Paul · Peugeot 208  │ ───────────────────────────────────  │
│   « Toujours dispo ? » │      Bonjour, toujours disponible ?  │
│ ○ Léa · VTT           │  Oui ! Vous passez quand ?     ✓✓    │
│   « Merci ! »         │      Demain 18 h ?                   │
│                       │ [Écrire un message…]  [Offre €] [➤]  │
└───────────────────────┴──────────────────────────────────────┘
```

## 6. Système de design

**Couleurs.** Orange de marque + gris neutres, définis une seule fois dans `index.css` (voir le code plus bas). Les ratios de contraste ont été **calculés** (norme WCAG, minimum 4,5:1 pour du texte) :

| Combinaison | Ratio | Usage |
|---|---|---|
| texte sombre `ink` sur orange `brand-500` | 5,2:1 ✓ | boutons principaux |
| texte `brand-700` sur blanc | 4,8:1 ✓ | prix, logo, liens |
| `gray-500` sur blanc | 4,8:1 ✓ | texte secondaire |
| texte **blanc** sur `brand-500` | **2,8:1 ✗** | **interdit** |
| texte `brand-500` sur blanc | **2,8:1 ✗** | **interdit** (décor et icônes seulement, ≥ 3:1 avec `brand-600`) |

Mon premier jet utilisait du texte blanc sur l'orange : il manquait de contraste, c'est corrigé dans le code livré.

**Typographie.** Police système (`system-ui`), aucune police à télécharger : rapide et lisible. Titres `text-2xl`/`3xl`, texte courant 16 px minimum (les téléphones agrandissent sinon la page à la saisie).

**Espacement et formes.** Échelle Tailwind (4 px). Cartes en `rounded-xl` avec bordure fine ; ombre seulement au survol. Cible tactile ≥ 44 px pour les boutons et icônes cliquables.

**Boutons.** Principal (orange, texte sombre) · secondaire (bordure grise) · discret (texte seul) · danger (rouge, pour « Supprimer » avec confirmation). Un état `disabled` et un état « en cours » (texte « Publication… ») sur tout bouton qui envoie une requête.

**Formulaires.** Étiquette **au-dessus** du champ (jamais seulement un `placeholder`), astérisque pour les champs obligatoires, message d'erreur sous le champ avec `role="alert"`, `inputMode="numeric"` sur les nombres, `autocomplete` renseigné (e-mail, nouveau mot de passe).

**Mode sombre.** Idée, pas dans le périmètre de départ ; le thème en variables CSS le rend possible plus tard.

## 7. Données, cache, erreurs

TanStack Query gère tout ce qui vient de l'API. Les composants n'appellent jamais `fetch` : ils passent par `api()` (`api/client.js`), qui ajoute le jeton, formate l'URL et transforme les erreurs du serveur en `ApiError` (avec `code` et `details`).

| Clé de requête | Contenu | Rechargée quand |
|---|---|---|
| `['categories']` | arbre des catégories | jamais (`staleTime: Infinity`) |
| `['category-schema', slug]` | champs dynamiques d'une catégorie | jamais |
| `['ads', filtres]` | une page de résultats | les filtres (donc l'URL) changent |
| `['ad', id]` | une fiche | après modification |
| `['favorite-ids']` | identifiants favoris | après ajout / retrait (mise à jour optimiste) |
| `['my-ads', statut]` | mes annonces | après dépôt, modification, suppression |
| `['conversations']` | boîte de réception | à l'arrivée d'un message (Socket.IO) |
| `['messages', conversationId]` | historique (défilement infini) | événement `message:new` |

Règle d'invalidation : **toute mutation qui change des données invalide les clés qui les affichent** (`queryClient.invalidateQueries`). Erreurs : une erreur de champ s'affiche sous le champ (`error.details`), une erreur réseau ou 500 dans un toast, un 401 déconnecte l'utilisateur (à ajouter dans `client.js` : appeler `logout()` quand `code` vaut `TOKEN_INVALID`).

## 8. Authentification côté front

1. `AuthProvider` démarre avec `loading = true`. S'il trouve un jeton dans `localStorage`, il appelle `GET /api/auth/me` ; sinon `loading` passe à `false` sans utilisateur.
2. `ProtectedRoute` attend la fin du chargement avant de décider : sans cela un utilisateur connecté serait renvoyé à la page de connexion à chaque rechargement.
3. À la connexion, on redirige vers la page d'origine (`location.state.from`) : un visiteur qui clique « Contacter » est renvoyé à la fiche après s'être connecté.
4. Le jeton est conservé dans `localStorage` en phase 1 (simple, mais lisible par un script injecté). En phase 2 : jeton court en mémoire + cookie `httpOnly` de rafraîchissement (détail dans le document 05, § 10).

## 9. Recherche et filtres

- **Tout est dans l'URL** : `/recherche?q=velo&category=velos&priceMax=30000&attr.type=VTT&page=2`. La recherche est partageable, le bouton « Retour » fonctionne, un rechargement ne perd rien. `useAdSearch()` lit l'URL et `setFilters()` la modifie ; changer un filtre ramène à la page 1.
- **Filtres communs** : catégorie (arbre à deux niveaux), prix en euros (convertis en centimes), tri, et « autour de moi ».
- **Filtres propres à la catégorie** : `FilterPanel` lit `GET /api/categories/:slug/schema` et affiche, pour chaque champ `filterable`, des cases à cocher (`select`), un min/max (`number`) ou une case (`boolean`). Choisir une autre catégorie efface les anciens `attr.*`. **Aucun filtre n'est écrit en dur** : ajouter un champ dans MongoDB suffit à le faire apparaître.
- **Pendant le chargement** d'une nouvelle page, l'ancienne reste affichée en légère transparence (`keepPreviousData`) au lieu de clignoter.
- **Aucun résultat** : message clair et suggestion d'élargir (retirer un filtre).

**« Autour de moi » et lieux** (deux API publiques gratuites, sans clé, testées avec les en-têtes CORS : appelables directement depuis le navigateur) :

- Villes : `https://geo.api.gouv.fr/communes?nom=Lyo&fields=nom,codesPostaux,centre&boost=population&limit=5`. ⚠ `centre.coordinates` est au format GeoJSON **`[longitude, latitude]`**, dans cet ordre (Lyon : `[4.8351, 45.758]`). Une ville peut avoir plusieurs codes postaux (Lyon : 9) : proposer le choix ou prendre le premier.
- Adresses : `https://data.geopf.fr/geocodage/search/?q=10 rue de la paix paris&limit=1` (le service du Géoportail). L'ancienne adresse `api-adresse.data.gouv.fr` ne renvoyait rien lors de mes essais : ne pas l'utiliser.
- Position de l'appareil : `navigator.geolocation.getCurrentPosition(...)`, qui ne fonctionne qu'en HTTPS ou sur `localhost`, et demande l'autorisation : prévoir le refus (retomber sur le choix d'une ville).
- Saisie avec **anti-rebond** (250 ms) et annulation de la requête précédente (`AbortController`), sinon une requête par lettre tapée.

**Vue carte** (phase 3). `react-leaflet` avec les tuiles OpenStreetMap (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`, attribution obligatoire, usage léger uniquement : correct pour une soutenance). Trois pièges connus de Leaflet avec Vite (non testés ici) : importer `leaflet/dist/leaflet.css` ; fournir soi-même les images des marqueurs (les chemins par défaut cassent à la compilation) ou utiliser un `divIcon` ; donner une **hauteur explicite** au conteneur de la carte, sinon elle est invisible. Par respect de la vie privée, l'API ne devrait publier que des coordonnées arrondies à 2 décimales (≈ 1 km).

## 10. Déposer une annonce

Un seul gros formulaire en **5 étapes** (React Hook Form garde les valeurs d'une étape à l'autre) :

1. **Catégorie** : choix en deux niveaux. Charge `category-schema` de la catégorie choisie.
2. **Détails** : titre, description, état, puis les champs de la catégorie générés par `DynamicFields` (liste, nombre, case à cocher, texte), avec leurs libellés, unités, bornes et caractère obligatoire. Le serveur les revalide : le formulaire n'est qu'une aide.
3. **Photos** : glisser-déposer + bouton (sur téléphone : appareil photo), aperçus, réorganisation, suppression, 10 maximum, 8 Mo chacune, JPEG/PNG/WebP. Contrôles côté client (type, taille) pour répondre vite ; le serveur contrôle à nouveau.
4. **Prix et lieu** : prix en euros → **centimes** (`Math.round(Number(valeur) * 100)`, ce qui évite `19,99 × 100 = 1998.9999…`), ville avec complétion (§ 9) qui remplit `city`, `postalCode`, `lat`, `lng`, livraison possible.
5. **Récapitulatif** : aperçu de la fiche telle qu'elle apparaîtra, puis « Publier ».

À la publication : `POST /api/ads` d'abord, puis `POST /api/ads/:id/images` avec les photos (`FormData`, champ `photos`). Si la création réussit mais l'envoi des photos échoue, **ne pas perdre l'annonce** : message « Annonce créée, mais les photos n'ont pas pu être envoyées », avec un bouton pour réessayer depuis « Modifier ».
Le brouillon est enregistré dans `localStorage` à chaque étape (confort par navigateur : il n'est pas partagé entre appareils) pour survivre à un rechargement ou à une coupure réseau.

## 11. Messagerie

- Deux routes : `/compte/messages` (liste) et `/compte/messages/:conversationId` (conversation). Sur ordinateur les deux s'affichent côte à côte ; sur mobile l'une remplace l'autre.
- La liste vient d'**une** requête (`GET /api/conversations`) : titre, photo, dernier message et compteur de non-lus sont dans le document de conversation (voir document 03, § 2).
- La conversation charge les 30 derniers messages, et « Voir les messages précédents » charge les 30 d'avant (`useInfiniteQuery`, curseur `before`).
- **Temps réel** : `connectSocket(token)` à la connexion, `disconnectSocket()` à la déconnexion. À chaque événement `message:new`, `useMessages` ajoute le message en tête de la première page, sans recharger.
- **Envoi** : `POST …/messages` ; le message s'affiche tout de suite en « envoi… » puis est confirmé. Il ne passe pas par le socket (voir document 05, § 4).
- Pastille de non-lus dans l'en-tête ; une offre de prix est un message de type `offer` avec boutons Accepter / Refuser (phase 3).
- Dans la fiche annonce, « Contacter » ouvre (ou retrouve) la conversation via `POST /api/conversations { adId }`, puis redirige.

## 12. Accessibilité, performance, référencement

**Accessibilité** (liste de contrôle) :

- Chaque champ a une `<label>` ; les erreurs ont `role="alert"` ; le focus clavier est toujours visible (`:focus-visible`, orange foncé).
- Tout se fait au clavier : menus, filtres, étapes du dépôt. Pas de `div` cliquable : un vrai `<button>` ou `<a>`.
- Boutons-icônes avec `aria-label` (le cœur indique aussi `aria-pressed`) ; images décoratives avec `alt=""`, photos d'annonce avec un `alt` descriptif sur la fiche.
- Résultats annoncés aux lecteurs d'écran (`aria-live="polite"` sur la liste), pagination dans une `<nav aria-label>`.
- Jamais d'information portée par la seule couleur ; contrastes vérifiés (§ 6) ; `lang="fr"` déjà présent dans `index.html`.
- Respecter `prefers-reduced-motion` pour les animations.

**Performance.**

- Pages chargées à la demande (`lazy` dans `App.jsx`). Mesuré lors du build : application principale ≈ 104 Ko compressés, page de recherche ≈ 6,5 Ko supplémentaires.
- Photos : `loading="lazy"`, miniatures de 400×300 pour les cartes (l'image 1280 px seulement sur la fiche), `aspect-[4/3]` réservé pour éviter que la page saute pendant le chargement.
- Squelettes de chargement plutôt qu'un cercle qui tourne ; anti-rebond sur les saisies ; `staleTime` de 30 s pour ne pas recharger à chaque clic.

**Référencement.** Un site React sans rendu serveur est mal indexé et n'a pas d'aperçu de lien : acceptable pour ce projet. Au minimum, un titre de page par route (petit hook `usePageTitle`) et une `meta description`. Le rendu serveur (Next.js, Remix) est hors périmètre.

## 13. Tests

- **Unitaires** (Vitest) : fonctions pures comme `formatPrice` et `timeAgo` (livrées).
- **Composants** (Testing Library) : `ProtectedRoute` (livré) ; à ajouter : `FilterPanel` (cocher une case modifie l'URL), `FavoriteButton` (visiteur redirigé vers la connexion), `DynamicFields` (champ obligatoire vide → message).
- **Bout en bout** (idée, Playwright, un seul scénario) : s'inscrire → déposer une annonce → la retrouver par la recherche → la mettre en favori → écrire au vendeur.

```bash
npm test -w frontend
```

## 14. Ce que je construirais, dans l'ordre

1. Installer les dépendances, remplacer `main.jsx`, `App.jsx`, `Layout`, `Header`, mettre `Footer` au nouveau style (le sien dépend du CSS du starter, remplacé), réécrire `Home` : le site s'affiche avec l'en-tête et le routeur.
2. `Login` / `Register` + `AuthContext` : on peut se connecter avec un compte du seed.
3. `Home` (catégories + dernières annonces) et `Search` avec `FilterPanel` : on trouve les annonces du seed.
4. `AdDetail` (galerie, caractéristiques dynamiques, vendeur, bouton contacter).
5. `PostAd` en 5 étapes + `ImageUploader`.
6. Compte : mes annonces, favoris, profil.
7. Messagerie.
8. Géolocalisation, carte, avis, alertes, administration.

## 15. Le code livré

Fichiers déjà écrits et testés. Ils remplacent ceux du starter portant le même nom (`main.jsx`, `App.jsx`, `Layout.jsx`, `Header.jsx`, `index.css`, `vite.config.js`) ou s'ajoutent. `Home.jsx`, `AdDetail.jsx`, `PostAd.jsx`, etc. restent à écrire.

**`frontend/src/index.css`**

```css
@import "tailwindcss";

/* Identité visuelle : orange chaleureux + gris neutres. Tailwind génère bg-brand-500, text-brand-700, etc.
   Contrastes (WCAG, calculés) : texte sombre sur brand-500 = 5,2:1 ; texte brand-700 sur blanc = 4,8:1.
   À ÉVITER : texte blanc sur brand-500 (2,8:1) et texte brand-500 sur blanc (2,8:1). */
@theme {
  --color-brand-50: #fff4ec;
  --color-brand-100: #ffe3cf;
  --color-brand-400: #ff8a42;
  --color-brand-500: #ff6e14;
  --color-brand-600: #e85d04;
  --color-brand-700: #c24d03;
  --color-ink: #1f2937;
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

@layer base {
  body {
    @apply bg-gray-50 font-sans text-ink antialiased;
  }
  /* Focus visible partout : indispensable pour la navigation au clavier */
  :focus-visible {
    @apply outline-2 outline-offset-2 outline-brand-700;
  }
}
```
**`frontend/src/main.jsx`**

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster richColors position="top-center" />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);
```
**`frontend/src/App.jsx`**

```jsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';

// Chaque page est chargée à la demande : le premier affichage reste léger.
const Search = lazy(() => import('./pages/Search.jsx'));
const AdDetail = lazy(() => import('./pages/AdDetail.jsx'));
const SellerProfile = lazy(() => import('./pages/SellerProfile.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const PostAd = lazy(() => import('./pages/PostAd.jsx'));
const AccountLayout = lazy(() => import('./pages/account/AccountLayout.jsx'));
const MyAds = lazy(() => import('./pages/account/MyAds.jsx'));
const Favorites = lazy(() => import('./pages/account/Favorites.jsx'));
const Messages = lazy(() => import('./pages/account/Messages.jsx'));
const Profile = lazy(() => import('./pages/account/Profile.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

export default function App() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-gray-500">Chargement…</p>}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="recherche" element={<Search />} />
          <Route path="annonces/:id" element={<AdDetail />} />
          <Route path="vendeur/:id" element={<SellerProfile />} />
          <Route path="connexion" element={<Login />} />
          <Route path="inscription" element={<Register />} />

          {/* Pages réservées aux utilisateurs connectés */}
          <Route element={<ProtectedRoute />}>
            <Route path="deposer" element={<PostAd />} />
            <Route path="annonces/:id/modifier" element={<PostAd />} />
            <Route path="compte" element={<AccountLayout />}>
              <Route index element={<MyAds />} />
              <Route path="favoris" element={<Favorites />} />
              <Route path="messages/:conversationId?" element={<Messages />} />
              <Route path="profil" element={<Profile />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
```
**`frontend/src/components/Layout.jsx`**

```jsx
import { Outlet } from 'react-router';
import Header from './Header.jsx';
import Footer from './Footer.jsx';

// Les pages s'affichent à la place de <Outlet />
export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
```
**`frontend/src/components/Header.jsx`**

```jsx
import { Link, useNavigate } from 'react-router';
import { Heart, MessageCircle, Plus, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onSearch(event) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q').trim();
    navigate(q ? `/recherche?q=${encodeURIComponent(q)}` : '/recherche');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="text-xl font-extrabold text-brand-700">LeBonDeal</Link>

        <Link
          to="/deposer"
          className="hidden items-center gap-1 rounded-lg bg-brand-500 px-4 py-2 font-semibold text-ink hover:bg-brand-400 sm:inline-flex"
        >
          <Plus size={18} aria-hidden="true" /> Déposer une annonce
        </Link>

        <form onSubmit={onSearch} role="search" className="min-w-0 flex-1">
          <input
            name="q"
            type="search"
            placeholder="Que recherchez-vous ?"
            aria-label="Rechercher une annonce"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2"
          />
        </form>

        <nav aria-label="Navigation principale" className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link to="/compte/favoris" aria-label="Mes favoris"><Heart size={22} /></Link>
              <Link to="/compte/messages" aria-label="Mes messages"><MessageCircle size={22} /></Link>
              <Link to="/compte" className="inline-flex items-center gap-1 font-medium">
                <User size={22} aria-hidden="true" /> <span className="hidden md:inline">{user.displayName}</span>
              </Link>
              <button type="button" onClick={logout} className="text-gray-500 hover:text-ink">Déconnexion</button>
            </>
          ) : (
            <Link to="/connexion" className="font-medium">Se connecter</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
```
**`frontend/src/routes/ProtectedRoute.jsx`**

```jsx
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';

// Enveloppe des routes privées. <ProtectedRoute role="admin" /> pour les pages d'administration.
export default function ProtectedRoute({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // on ne sait pas encore si le visiteur est connecté : évite un faux redirect
  if (!user) return <Navigate to="/connexion" replace state={{ from: location }} />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
```
**`frontend/src/api/client.js`**

```js
// Client HTTP unique du frontend. Les composants n'appellent jamais fetch directement.
// Succès : { data, meta? }  —  Erreur : { error: { code, message, details? } } (voir middlewares/errorHandler.js)
let accessToken = null;
export const setAccessToken = (token) => { accessToken = token; };

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `Erreur ${status}`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details; // [{ path, message }] pour les erreurs de validation
  }
}

export async function api(path, { method = 'GET', body, params, signal } = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null && value !== '') url.searchParams.set(key, value);
  }

  const isForm = body instanceof FormData; // envoi de photos : le navigateur fixe lui-même le Content-Type
  const response = await fetch(url, {
    method,
    signal,
    headers: {
      ...(body && !isForm && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}
```
**`frontend/src/context/AuthContext.jsx`**

```jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAccessToken } from '../api/client.js';

const AuthContext = createContext(null);
const TOKEN_KEY = 'lbd_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true tant qu'on ne sait pas si le visiteur est connecté

  // Au chargement de la page : si un jeton est mémorisé, on demande à l'API qui est connecté.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    setAccessToken(token);
    api('/auth/me')
      .then(({ data }) => setUser(data))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setAccessToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (credentials) => {
    const { data } = await api('/auth/login', { method: 'POST', body: credentials });
    localStorage.setItem(TOKEN_KEY, data.token);
    setAccessToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  return useContext(AuthContext);
}
```
**`frontend/src/hooks/useAdSearch.js`**

```js
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

// Les filtres vivent dans l'URL (?q=velo&category=velos&priceMax=30000&attr.type=VTT&page=2) :
// la recherche est partageable, le bouton « Retour » fonctionne, et un rechargement de page ne perd rien.
export function useAdSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Object.fromEntries(searchParams);

  const query = useQuery({
    queryKey: ['ads', filters],
    queryFn: ({ signal }) => api('/ads', { params: filters, signal }),
    placeholderData: keepPreviousData, // l'ancienne liste reste affichée pendant le chargement de la suivante
  });

  // setFilters({ priceMax: 30000 }) modifie ou ajoute ; une valeur vide supprime le filtre.
  function setFilters(patch) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      if ('category' in patch) {
        for (const key of [...next.keys()]) if (key.startsWith('attr.')) next.delete(key); // filtres propres à l'ancienne catégorie
      }
      if (!('page' in patch)) next.delete('page'); // changer un filtre ramène à la page 1
      return next;
    });
  }

  return { filters, setFilters, ...query };
}
```
**`frontend/src/hooks/useCategories.js`**

```js
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

// Arbre des catégories : [{ id, slug, name, icon, children: [{ id, slug, name }] }]. Change presque jamais : on le garde en mémoire.
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api('/categories')).data,
    staleTime: Infinity,
  });
}

// Définition des champs dynamiques d'une catégorie (MongoDB, collection category_schemas) :
// { categorySlug, fields: [{ key, label, type, required, filterable, options, unit, min, max }] }
export function useCategorySchema(slug) {
  return useQuery({
    queryKey: ['category-schema', slug],
    queryFn: async () => (await api(`/categories/${slug}/schema`)).data,
    enabled: Boolean(slug),
    staleTime: Infinity,
  });
}
```
**`frontend/src/lib/format.js`**

```js
// Les prix circulent en centimes (entiers) entre la base, l'API et le frontend : 12,50 € = 1250.
export function formatPrice(cents) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2, // « 150 € » mais « 12,50 € »
  }).format(cents / 100);
}

const relativeTime = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const UNITS = [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3_600], ['minute', 60]];

// « il y a 3 heures », « hier », « il y a 2 mois »…
export function timeAgo(date) {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000; // négatif = dans le passé
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
  }
  return "à l'instant";
}
```
**`frontend/src/components/ads/AdCard.jsx`**

```jsx
import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import { formatPrice, timeAgo } from '../../lib/format.js';
import FavoriteButton from './FavoriteButton.jsx';

// ad : une ligne de GET /api/ads -> { id, title, priceCents, city, coverUrl, publishedAt, distanceKm }
export default function AdCard({ ad }) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-gray-200 bg-white transition hover:shadow-md">
      <Link to={`/annonces/${ad.id}`} className="block">
        <div className="aspect-[4/3] bg-gray-100">
          {ad.coverUrl && <img src={ad.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </div>
        <div className="space-y-1 p-3">
          <h3 className="line-clamp-2 font-medium">{ad.title}</h3>
          <p className="text-lg font-bold text-brand-700">{formatPrice(ad.priceCents)}</p>
          <p className="flex items-center gap-1 text-sm text-gray-500">
            <MapPin size={14} aria-hidden="true" />
            {ad.city}{ad.distanceKm != null && ` (${ad.distanceKm} km)`} · {timeAgo(ad.publishedAt)}
          </p>
        </div>
      </Link>
      <FavoriteButton adId={ad.id} className="absolute right-2 top-2" />
    </article>
  );
}
```
**`frontend/src/components/ads/FavoriteButton.jsx`**

```jsx
import { Heart } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const KEY = ['favorite-ids'];

// Identifiants des annonces favorites : chargés une seule fois, partagés par toutes les cartes de la page.
function useFavoriteIds() {
  const { user } = useAuth();
  return useQuery({ queryKey: KEY, queryFn: async () => (await api('/favorites/ids')).data, enabled: Boolean(user) });
}

export default function FavoriteButton({ adId, className = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: favoriteIds = [] } = useFavoriteIds();
  const isFavorite = favoriteIds.includes(adId);

  const toggle = useMutation({
    mutationFn: () => api(`/favorites/${adId}`, { method: isFavorite ? 'DELETE' : 'PUT' }),
    // Mise à jour optimiste : le cœur change tout de suite, sans attendre la réponse du serveur…
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData(KEY);
      queryClient.setQueryData(KEY, isFavorite ? previous.filter((id) => id !== adId) : [...previous, adId]);
      return { previous };
    },
    // …et revient en arrière si le serveur refuse.
    onError: (_error, _variables, context) => queryClient.setQueryData(KEY, context.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  function onClick() {
    if (!user) return navigate('/connexion'); // visiteur non connecté
    toggle.mutate();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={`rounded-full bg-white/90 p-2 shadow ${className}`}
    >
      <Heart size={20} className={isFavorite ? 'fill-brand-600 text-brand-600' : 'text-gray-600'} />
    </button>
  );
}
```
**`frontend/src/components/ads/FilterPanel.jsx`**

```jsx
import { useCategories, useCategorySchema } from '../../hooks/useCategories.js';

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2';

// Filtres propres à la catégorie choisie, construits depuis sa définition MongoDB.
// Dans l'URL : ?attr.carburant=Diesel,Hybride  ?attr.kilometrage.max=100000  ?attr.meuble=true
function DynamicFilter({ field, filters, setFilters }) {
  const param = `attr.${field.key}`;

  if (field.type === 'select') {
    const selected = filters[param]?.split(',') ?? [];
    const toggle = (option) => {
      const next = selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option];
      setFilters({ [param]: next.join(',') });
    };
    return (
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{field.label}</legend>
        {field.options.map((option) => (
          <label key={option} className="mr-3 inline-flex items-center gap-1 text-sm">
            <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} /> {option}
          </label>
        ))}
      </fieldset>
    );
  }

  if (field.type === 'number') {
    return (
      <fieldset>
        <legend className="mb-1 text-sm font-medium">{field.label}{field.unit && ` (${field.unit})`}</legend>
        <div className="flex gap-2">
          {['min', 'max'].map((bound) => (
            <input
              key={bound}
              type="number"
              inputMode="numeric"
              placeholder={bound === 'min' ? 'Min' : 'Max'}
              aria-label={`${field.label} ${bound === 'min' ? 'minimum' : 'maximum'}`}
              defaultValue={filters[`${param}.${bound}`] ?? ''}
              onBlur={(event) => setFilters({ [`${param}.${bound}`]: event.target.value })}
              className={inputClass}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={filters[param] === 'true'} onChange={(e) => setFilters({ [param]: e.target.checked ? 'true' : '' })} />
        {field.label}
      </label>
    );
  }
  return null;
}

export default function FilterPanel({ filters, setFilters }) {
  const { data: categories = [] } = useCategories();
  const { data: schema } = useCategorySchema(filters.category);
  const dynamicFilters = schema?.fields.filter((field) => field.filterable) ?? [];

  return (
    <aside aria-label="Filtres" className="space-y-4 self-start rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <label htmlFor="category" className="mb-1 block text-sm font-medium">Catégorie</label>
        <select id="category" value={filters.category ?? ''} onChange={(e) => setFilters({ category: e.target.value })} className={inputClass}>
          <option value="">Toutes les catégories</option>
          {categories.map((parent) => (
            <optgroup key={parent.id} label={parent.name}>
              <option value={parent.slug}>Tout : {parent.name}</option>
              {parent.children.map((child) => <option key={child.id} value={child.slug}>{child.name}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Prix (€)</legend>
        <div className="flex gap-2">
          {[['priceMin', 'Min'], ['priceMax', 'Max']].map(([param, label]) => (
            <input
              key={param}
              type="number"
              min="0"
              placeholder={label}
              aria-label={`Prix ${label === 'Min' ? 'minimum' : 'maximum'} en euros`}
              defaultValue={filters[param] ? Number(filters[param]) / 100 : ''}
              onBlur={(event) => setFilters({ [param]: event.target.value ? Math.round(Number(event.target.value) * 100) : '' })} // euros -> centimes
              className={inputClass}
            />
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="sort" className="mb-1 block text-sm font-medium">Trier par</label>
        <select id="sort" value={filters.sort ?? 'recent'} onChange={(e) => setFilters({ sort: e.target.value })} className={inputClass}>
          <option value="recent">Plus récentes</option>
          <option value="price_asc">Prix croissant</option>
          <option value="price_desc">Prix décroissant</option>
        </select>
      </div>

      {dynamicFilters.map((field) => <DynamicFilter key={`${filters.category}-${field.key}`} field={field} filters={filters} setFilters={setFilters} />)}
    </aside>
  );
}
```
**`frontend/src/pages/Search.jsx`**

```jsx
import { useAdSearch } from '../hooks/useAdSearch.js';
import AdCard from '../components/ads/AdCard.jsx';
import FilterPanel from '../components/ads/FilterPanel.jsx';

// Réponse de GET /api/ads : { data: [annonces], meta: { total, page, limit } }
export default function Search() {
  const { filters, setFilters, data, isPending, isError, isPlaceholderData } = useAdSearch();
  const page = Number(filters.page ?? 1);
  const pageCount = data ? Math.ceil(data.meta.total / data.meta.limit) : 0;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[18rem_1fr]">
      <FilterPanel filters={filters} setFilters={setFilters} />

      <section aria-live="polite" className={isPlaceholderData ? 'opacity-60 transition' : 'transition'}>
        {isPending && <p>Chargement des annonces…</p>}
        {isError && <p role="alert" className="text-red-600">Impossible de charger les annonces. Réessayez dans un instant.</p>}

        {data && (
          <>
            <h1 className="mb-4 text-xl font-bold">
              {data.meta.total} annonce{data.meta.total > 1 ? 's' : ''}{filters.q && ` pour « ${filters.q} »`}
            </h1>

            {data.data.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
                Aucune annonce ne correspond. Essayez d'élargir votre recherche.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {data.data.map((ad) => <li key={ad.id}><AdCard ad={ad} /></li>)}
              </ul>
            )}

            {pageCount > 1 && (
              <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-4">
                <button type="button" disabled={page <= 1} onClick={() => setFilters({ page: page - 1 })} className="rounded-lg border px-4 py-2 disabled:opacity-40">Précédent</button>
                <span>Page {page} sur {pageCount}</span>
                <button type="button" disabled={page >= pageCount} onClick={() => setFilters({ page: page + 1 })} className="rounded-lg border px-4 py-2 disabled:opacity-40">Suivant</button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
```
**`frontend/src/components/forms/DynamicFields.jsx`**

```jsx
// Génère les champs du formulaire « Déposer une annonce » depuis la définition de la catégorie (MongoDB).
// À utiliser avec react-hook-form : <DynamicFields fields={schema.fields} register={register} errors={errors} />
// Les valeurs sont envoyées dans `attributes` ; le backend les revalide (buildAttributesSchema).
export default function DynamicFields({ fields, register, errors }) {
  return fields.map((field) => {
    const name = `attributes.${field.key}`;
    const error = errors?.attributes?.[field.key];
    const label = `${field.label}${field.unit ? ` (${field.unit})` : ''}${field.required ? ' *' : ''}`;

    return (
      <div key={field.key}>
        <label htmlFor={name} className="mb-1 block text-sm font-medium">{label}</label>

        {field.type === 'select' && (
          <select id={name} {...register(name, { required: field.required && 'Champ obligatoire' })} className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="">Choisir…</option>
            {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        )}

        {field.type === 'boolean' && <input id={name} type="checkbox" {...register(name)} className="size-5" />}

        {(field.type === 'number' || field.type === 'text') && (
          <input
            id={name}
            type={field.type}
            min={field.min}
            max={field.max}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
            {...register(name, {
              required: field.required && 'Champ obligatoire',
              // champ numérique vide -> undefined (et non NaN), pour que l'API ne reçoive pas de valeur
              setValueAs: field.type === 'number' ? (value) => (value === '' ? undefined : Number(value)) : undefined,
            })}
          />
        )}

        {error && <p role="alert" className="mt-1 text-sm text-red-600">{error.message}</p>}
      </div>
    );
  });
}
```
**`frontend/src/lib/socket.js`**

```js
import { io } from 'socket.io-client';

// Une seule connexion WebSocket par onglet, ouverte à la connexion de l'utilisateur.
// Même origine que le site : en développement le proxy Vite relaie /socket.io, en production nginx.
let socket = null;

export function connectSocket(token) {
  socket?.disconnect();
  socket = io({ auth: { token } }); // le backend vérifie le jeton dans io.use(...)
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export const getSocket = () => socket;
```
**`frontend/src/hooks/useMessages.js`**

```js
import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { getSocket } from '../lib/socket.js';

// Historique d'une conversation : on charge les 30 messages les plus récents,
// « Voir les messages précédents » charge les 30 d'avant (paramètre `before` = date du plus ancien déjà reçu).
// Réponse de GET /api/conversations/:id/messages : { data: [messages, du plus récent au plus ancien], meta: { nextBefore } }
export function useMessages(conversationId) {
  const queryClient = useQueryClient();
  const queryKey = ['messages', conversationId];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => api(`/conversations/${conversationId}/messages`, { params: { before: pageParam } }),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextBefore ?? undefined,
    enabled: Boolean(conversationId),
  });

  // Temps réel : le serveur émet « message:new » ; on ajoute le message en tête de la première page, sans recharger.
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !conversationId) return undefined;

    const onNewMessage = (message) => {
      if (message.conversationId !== conversationId) return;
      queryClient.setQueryData(queryKey, (old) => old && {
        ...old,
        pages: old.pages.map((page, index) => (index === 0 ? { ...page, data: [message, ...page.data] } : page)),
      });
    };
    socket.on('message:new', onNewMessage);
    return () => socket.off('message:new', onNewMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, queryClient]);

  return query;
}

export function sendMessage(conversationId, text) {
  return api(`/conversations/${conversationId}/messages`, { method: 'POST', body: { text } });
}
```
Tests et configuration (le `vite.config.js` est le même que dans le document 04) :

**`frontend/src/lib/format.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { formatPrice, timeAgo } from './format.js';

describe('formatPrice', () => {
  it('affiche les euros entiers sans décimales', () => {
    expect(formatPrice(15000)).toMatch(/^150\s€$/);
  });

  it('affiche les centimes quand il y en a', () => {
    expect(formatPrice(1250)).toMatch(/^12,50\s€$/);
  });
});

describe('timeAgo', () => {
  it('formate en français', () => {
    expect(timeAgo(Date.now() - 3 * 3_600_000)).toBe('il y a 3 heures');
    expect(timeAgo(Date.now() - 86_400_000)).toBe('hier');
    expect(timeAgo(Date.now() - 5_000)).toBe("à l'instant");
  });
});
```
**`frontend/src/routes/ProtectedRoute.test.jsx`**

```jsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import ProtectedRoute from './ProtectedRoute.jsx';
import { useAuth } from '../context/AuthContext.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/connexion" element={<p>Page de connexion</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/compte" element={<p>Mon compte</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirige un visiteur non connecté vers la connexion', () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderAt('/compte');
    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
  });

  it('laisse passer un utilisateur connecté', () => {
    useAuth.mockReturnValue({ user: { id: '1', role: 'user' }, loading: false });
    renderAt('/compte');
    expect(screen.getByText('Mon compte')).toBeInTheDocument();
  });
});
```
**`frontend/src/test/setup.js`**

```js
import '@testing-library/jest-dom/vitest';
```
## 16. Ce qui reste à écrire dans ce plan

Pages : `Home`, `AdDetail`, `SellerProfile`, `Login`, `Register`, `PostAd`, `NotFound`, et l'espace `account/*`. Composants : `ImageUploader`, `CityPicker`, `Stepper`, `Gallery`, `ChatWindow`, `ConversationList`, `Skeleton`, `Pagination`, etc. Le `useAuth` n'appelle pas encore `connectSocket` à la connexion (une ligne à ajouter avec la messagerie).

## 17. Ce qui a été vérifié

- `vite build` : 2095 modules transformés, pages découpées en fichiers séparés, sans erreur (des pages vides ont servi à satisfaire les imports du routeur).
- `esbuild --bundle` sur `DynamicFields`, `useMessages`, `socket`, `Header` (non importés par le build) : compilent, leurs imports se résolvent.
- `vitest` : 5 tests passent (formatage des prix et dates, redirection de `ProtectedRoute`).
- Installation de toutes les bibliothèques de la liste sans conflit (avec `@hookform/resolvers@^5`).
- Le proxy Vite achemine `/api/categories`, `/api/ads?...`, `/api/auth/login` vers le vrai backend, et les réponses ont exactement la forme attendue par `AdCard` et `FilterPanel`.
- Contrastes de couleur calculés.

**Non vérifié** : le rendu dans un navigateur (aucune capture d'écran n'a été faite), le comportement réel de `FavoriteButton`, `FilterPanel`, `DynamicFields` et `useMessages` avec un utilisateur (ils compilent mais n'ont pas de test de composant), Leaflet, l'adaptation mobile, l'accessibilité au lecteur d'écran. Les maquettes ci-dessus sont des schémas, pas un design validé : je peux produire de vraies maquettes visuelles dans le navigateur si vous le souhaitez.
