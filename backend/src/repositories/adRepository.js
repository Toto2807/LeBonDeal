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
