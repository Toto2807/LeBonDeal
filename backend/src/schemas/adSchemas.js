import { z } from 'zod';

// Champs communs au dépôt et à la modification d'une annonce.
const adShape = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  priceCents: z.number().int().min(0).max(2_000_000_000),
  itemCondition: z.enum(['new', 'like_new', 'good', 'fair', 'for_parts']).optional(),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().regex(/^\d{5}$/, 'Code postal à 5 chiffres'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  shippingAvailable: z.boolean().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(), // validé ensuite contre le schéma de la catégorie (MongoDB)
};
const coordinatesTogether = [(ad) => (ad.lat == null) === (ad.lng == null), { message: 'lat et lng vont ensemble' }];

export const createAdSchema = z
  .object({ ...adShape, categorySlug: z.string().min(1) })
  .refine(...coordinatesTogether);

// Modification : tout est facultatif mais au moins un champ ; un champ inconnu est refusé ;
// la catégorie ne peut pas changer (categorySlug n'est donc pas accepté).
export const updateAdSchema = z
  .strictObject(adShape)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Aucun champ à modifier' })
  .refine(...coordinatesTogether);

// Nouvel ordre des photos : la liste complète des identifiants, dans l'ordre voulu.
export const reorderSchema = z.strictObject({ ids: z.array(z.uuid()).min(1).max(10) });

// Changement de statut. « sold » accepte l'acheteur (optionnel) ; « draft » et « deleted » ne se demandent pas ici.
export const statusSchema = z
  .strictObject({
    status: z.enum(['active', 'reserved', 'sold', 'archived']),
    buyerId: z.uuid().optional(),
  })
  .refine((body) => body.buyerId === undefined || body.status === 'sold', {
    message: "buyerId n'est accepté que pour le statut « sold »",
  });

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

// Paramètres de GET /api/users/me/ads (les annonces supprimées ne sont jamais listées).
export const myAdsQuerySchema = z.object({
  status: z.enum(['draft', 'active', 'reserved', 'sold', 'archived']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
