import { config } from '../config/env.js';
import { query, withTransaction, camelize } from '../config/postgres.js';
import { AdDetails } from '../models/AdDetails.js';
import { CategorySchema } from '../models/CategorySchema.js';
import { saveAdImage } from './imageService.js';
import { buildAttributesSchema } from '../utils/attributes.js';
import { HttpError } from '../utils/HttpError.js';

// `input` a déjà été validé par createAdSchema (voir le contrôleur).
export async function createAd(sellerId, input) {
  const { attributes = {}, categorySlug, ...ad } = input;

  const [category] = await query('SELECT id FROM categories WHERE slug = $1 AND parent_id IS NOT NULL', [categorySlug]);
  if (!category) throw new HttpError(400, 'CATEGORY_INVALID', 'Catégorie inconnue');

  // Champs dynamiques : validés contre la définition de la catégorie stockée dans MongoDB.
  const definition = await CategorySchema.findOne({ categorySlug }).lean();
  const cleanAttributes = buildAttributesSchema(definition?.fields ?? []).parse(attributes);

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO ads (seller_id, category_id, title, description, price_cents, item_condition,
                        city, postal_code, lat, lng, shipping_available)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [sellerId, category.id, ad.title, ad.description, ad.priceCents, ad.itemCondition ?? null,
       ad.city, ad.postalCode, ad.lat ?? null, ad.lng ?? null, ad.shippingAvailable ?? false]
    );
    // Si l'écriture MongoDB échoue, l'exception remonte et PostgreSQL annule l'INSERT (ROLLBACK).
    // Cas rare restant : MongoDB réussit puis le COMMIT échoue -> un document orphelin (tâche de réconciliation en phase 4).
    await AdDetails.create({ adId: rows[0].id, categorySlug, attributes: cleanAttributes });
    return camelize(rows[0]);
  });
}

// Ajoute des photos à une annonce dont l'utilisateur est le vendeur. `files` vient de multer (req.files).
export async function addImages(userId, adId, files) {
  const [ad] = await query('SELECT seller_id FROM ads WHERE id = $1 AND deleted_at IS NULL', [adId]);
  if (!ad) throw new HttpError(404, 'AD_NOT_FOUND', 'Annonce introuvable');
  if (ad.sellerId !== userId) throw new HttpError(403, 'FORBIDDEN', "Cette annonce n'est pas la vôtre");
  if (files.length === 0) throw new HttpError(400, 'NO_FILE', 'Aucune photo reçue');

  const [{ n: existing }] = await query('SELECT count(*)::int AS n FROM ad_images WHERE ad_id = $1', [adId]);
  if (existing + files.length > 10) throw new HttpError(400, 'TOO_MANY_IMAGES', '10 photos maximum par annonce');

  const saved = [];
  for (const [index, file] of files.entries()) {
    const { url, thumbUrl } = await saveAdImage(file.buffer, config.uploadDir);
    const [image] = await query(
      `INSERT INTO ad_images (ad_id, url, thumb_url, position) VALUES ($1, $2, $3, $4)
       RETURNING id, url, thumb_url, position`,
      [adId, url, thumbUrl, existing + index]
    );
    saved.push(image);
  }
  return saved;
}
