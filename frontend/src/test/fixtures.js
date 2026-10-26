// Données de test partagées : mêmes formes que les réponses de l'API (voir docs/lebondeal/05-backend.md).
export const categories = [
  { id: 1, slug: 'vehicules', name: 'Véhicules', icon: 'car', children: [{ id: 10, slug: 'voitures', name: 'Voitures' }, { id: 8, slug: 'velos', name: 'Vélos' }] },
  { id: 2, slug: 'immobilier', name: 'Immobilier', icon: 'house', children: [{ id: 20, slug: 'locations', name: 'Locations' }] },
  { id: 3, slug: 'multimedia', name: 'Multimédia', icon: 'smartphone', children: [] },
  { id: 4, slug: 'maison', name: 'Maison & Jardin', icon: 'sofa', children: [] },
  { id: 5, slug: 'mode', name: 'Mode', icon: 'shirt', children: [] },
  { id: 6, slug: 'loisirs', name: 'Loisirs', icon: 'gamepad-2', children: [] },
];

export const adCard = (index, overrides = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${index}`,
  title: `Annonce numéro ${index}`,
  priceCents: 15000 + index * 100,
  city: 'Lyon',
  coverUrl: `/uploads/photo-${index}-thumb.webp`,
  publishedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  distanceKm: null,
  ...overrides,
});

export const adsPage = (count = 3, { total = count, page = 1, limit = 20 } = {}) => ({
  data: Array.from({ length: count }, (_, index) => adCard(index + 1)),
  meta: { total, page, limit },
});

// Réponse de GET /api/ads/:id (AdDetail) et définition des champs dynamiques de la catégorie « voitures ».
export const adDetail = (overrides = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Peugeot 208 en excellent état',
  description: 'Très bon état, entretien suivi, contrôle technique valide.',
  priceCents: 850000,
  itemCondition: 'good',
  status: 'active',
  city: 'Lyon',
  postalCode: '69003',
  lat: 45.76,
  lng: 4.84,
  shippingAvailable: false,
  publishedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  updatedAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  category: { id: 10, slug: 'voitures', name: 'Voitures', parent: { slug: 'vehicules', name: 'Véhicules' } },
  images: [
    { id: 'img-1', url: '/uploads/a.webp', thumbUrl: '/uploads/a-thumb.webp', position: 0 },
    { id: 'img-2', url: '/uploads/b.webp', thumbUrl: '/uploads/b-thumb.webp', position: 1 },
    { id: 'img-3', url: '/uploads/c.webp', thumbUrl: '/uploads/c-thumb.webp', position: 2 },
  ],
  attributes: { marque: 'Peugeot', modele: '208', annee: 2019, kilometrage: 80000, carburant: 'Diesel' },
  seller: {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Marie',
    avatarUrl: null,
    memberSince: '2025-03-10T10:00:00.000Z',
    ratingAvg: null,
    ratingCount: 0,
    activeAdsCount: 3,
  },
  priceHint: 'good_deal',
  ...overrides,
});

export const carSchema = {
  categorySlug: 'voitures',
  fields: [
    { key: 'marque', label: 'Marque', type: 'select', required: true, options: ['Peugeot', 'Renault'] },
    { key: 'modele', label: 'Modèle', type: 'text', required: true },
    { key: 'annee', label: 'Année', type: 'number', required: true },
    { key: 'kilometrage', label: 'Kilométrage', type: 'number', required: true, unit: 'km', filterable: true },
    { key: 'carburant', label: 'Carburant', type: 'select', required: true, filterable: true, options: ['Essence', 'Diesel'] },
  ],
};
