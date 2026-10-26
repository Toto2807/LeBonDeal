import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/env.js';
import { query, withTransaction, camelize } from '../config/postgres.js';
import { AdDetails } from '../models/AdDetails.js';
import { CategorySchema } from '../models/CategorySchema.js';
import { saveAdImage } from './imageService.js';
import { buildAttributesSchema } from '../utils/attributes.js';
import { HttpError } from '../utils/HttpError.js';

const PRICE_HINT_SQL = readFileSync(new URL('../sql/price-hint.sql', import.meta.url), 'utf8');
const PUBLIC_STATUSES = ['active', 'reserved', 'sold'];
const EDITABLE_STATUSES = ['draft', 'active', 'reserved', 'archived'];
// Transitions de statut autorisées. « sold » et « deleted » sont définitifs : une vente peut avoir des avis.
const TRANSITIONS = {
  draft: ['active'],
  active: ['reserved', 'sold', 'archived'],
  reserved: ['active', 'sold', 'archived'],
  archived: ['active'],
  sold: [],
  deleted: [],
};
// Colonnes modifiables : liste blanche (nom dans l'API -> colonne SQL). Aucun nom de colonne ne vient jamais du client.
const UPDATABLE_COLUMNS = {
  title: 'title',
  description: 'description',
  priceCents: 'price_cents',
  itemCondition: 'item_condition',
  city: 'city',
  postalCode: 'postal_code',
  lat: 'lat',
  lng: 'lng',
  shippingAvailable: 'shipping_available',
};
const round2 = (value) => (value == null ? null : Math.round(value * 100) / 100); // ≈ 1 km : la position exacte n'est jamais publiée

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
  await withTransaction(async (client) => assertEditable(await lockOwnedAd(client, userId, adId)));
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

// Fiche complète d'une annonce. Les annonces non publiques (brouillon, archivée) ne sont lisibles que de leur propriétaire,
// les supprimées de personne. Réponse 404 dans tous ces cas : on ne révèle pas l'existence d'une annonce cachée.
export async function getAd(adId, viewerId = null) {
  const [ad] = await query(
    `SELECT a.id, a.seller_id, a.title, a.description, a.price_cents, a.item_condition, a.status, a.city, a.postal_code,
            a.lat, a.lng, a.shipping_available, a.published_at, a.updated_at,
            c.id AS category_id, c.slug AS category_slug, c.name AS category_name,
            p.slug AS parent_slug, p.name AS parent_name
     FROM ads a
     JOIN categories c ON c.id = a.category_id
     LEFT JOIN categories p ON p.id = c.parent_id
     WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [adId]
  );
  if (!ad || (!PUBLIC_STATUSES.includes(ad.status) && ad.sellerId !== viewerId)) {
    throw new HttpError(404, 'AD_NOT_FOUND', 'Annonce introuvable');
  }

  const [images, details, [seller], [hint]] = await Promise.all([
    query('SELECT id, url, thumb_url, position FROM ad_images WHERE ad_id = $1 ORDER BY position', [adId]),
    AdDetails.findOne({ adId }).lean(),
    query(
      `SELECT u.id, u.display_name, u.avatar_url, u.created_at AS member_since, s.rating_avg, s.rating_count,
              (SELECT count(*)::int FROM ads x WHERE x.seller_id = u.id AND x.status = 'active' AND x.deleted_at IS NULL) AS active_ads_count
       FROM users u JOIN v_seller_stats s ON s.user_id = u.id
       WHERE u.id = $1`,
      [ad.sellerId]
    ),
    query(PRICE_HINT_SQL, [adId]),
  ]);

  return {
    id: ad.id,
    title: ad.title,
    description: ad.description,
    priceCents: ad.priceCents,
    itemCondition: ad.itemCondition,
    status: ad.status,
    city: ad.city,
    postalCode: ad.postalCode,
    lat: round2(ad.lat),
    lng: round2(ad.lng),
    shippingAvailable: ad.shippingAvailable,
    publishedAt: ad.publishedAt,
    updatedAt: ad.updatedAt,
    category: {
      id: ad.categoryId,
      slug: ad.categorySlug,
      name: ad.categoryName,
      parent: ad.parentSlug ? { slug: ad.parentSlug, name: ad.parentName } : null,
    },
    images,
    attributes: details?.attributes ?? {},
    seller: {
      id: seller.id,
      displayName: seller.displayName,
      avatarUrl: seller.avatarUrl,
      memberSince: seller.memberSince,
      ratingAvg: seller.ratingAvg == null ? null : Number(seller.ratingAvg), // numeric : renvoyé en texte par pg
      ratingCount: Number(seller.ratingCount),
      activeAdsCount: seller.activeAdsCount,
    },
    priceHint: hint?.priceHint ?? 'unknown',
  };
}

// « Mes annonces » : toutes les annonces du vendeur sauf les supprimées, les plus récentes d'abord.
export async function listMyAds(userId, { status = null, page, limit }) {
  const [items, [{ total }]] = await Promise.all([
    query(
      `SELECT id, title, price_cents, status, city, postal_code, cover_url, published_at
       FROM v_ad_cards
       WHERE seller_id = $1 AND ($2::ad_status IS NULL OR status = $2::ad_status)
       ORDER BY published_at DESC, id
       LIMIT $3 OFFSET $4`,
      [userId, status, limit, (page - 1) * limit]
    ),
    query(
      `SELECT count(*)::int AS total FROM v_ad_cards
       WHERE seller_id = $1 AND ($2::ad_status IS NULL OR status = $2::ad_status)`,
      [userId, status]
    ),
  ]);
  return { items, total };
}

// Verrouille la ligne de l'annonce jusqu'à la fin de la transaction (FOR UPDATE : deux écritures simultanées s'exécutent
// l'une après l'autre) et vérifie que l'utilisateur en est le propriétaire.
// Une annonce cachée d'autrui reste introuvable (404) ; une annonce publique d'autrui est interdite (403).
async function lockOwnedAd(client, userId, adId) {
  const { rows } = await client.query(
    `SELECT a.id, a.seller_id, a.status, a.price_cents, c.slug AS category_slug
     FROM ads a JOIN categories c ON c.id = a.category_id
     WHERE a.id = $1 AND a.deleted_at IS NULL
     FOR UPDATE OF a`,
    [adId]
  );
  const ad = rows[0] && camelize(rows[0]);
  if (!ad) throw new HttpError(404, 'AD_NOT_FOUND', 'Annonce introuvable');
  if (ad.sellerId !== userId) {
    if (!PUBLIC_STATUSES.includes(ad.status)) throw new HttpError(404, 'AD_NOT_FOUND', 'Annonce introuvable');
    throw new HttpError(403, 'FORBIDDEN', "Cette annonce n'est pas la vôtre");
  }
  return ad;
}

// Une annonce vendue n'est plus modifiable (ni ses champs, ni ses photos). Retourne l'annonce pour pouvoir chaîner.
function assertEditable(ad) {
  if (!EDITABLE_STATUSES.includes(ad.status)) {
    throw new HttpError(409, 'AD_NOT_EDITABLE', 'Une annonce vendue ne peut plus être modifiée');
  }
  return ad;
}

// `patch` a déjà été validé par updateAdSchema. Retourne la fiche mise à jour (même forme que getAd).
export async function updateAd(userId, adId, patch) {
  const { attributes, ...columns } = patch;

  await withTransaction(async (client) => {
    const ad = assertEditable(await lockOwnedAd(client, userId, adId));

    // Validation AVANT toute écriture : un champ dynamique invalide ne laisse rien derrière lui.
    let cleanAttributes;
    if (attributes) {
      const definition = await CategorySchema.findOne({ categorySlug: ad.categorySlug }).lean();
      cleanAttributes = buildAttributesSchema(definition?.fields ?? []).parse(attributes);
    }

    const entries = Object.entries(columns).filter(([key]) => key in UPDATABLE_COLUMNS);
    const assignments = entries.map(([key], index) => `${UPDATABLE_COLUMNS[key]} = $${index + 2}`);
    await client.query(
      `UPDATE ads SET ${assignments.length > 0 ? assignments.join(', ') : 'updated_at = now()'} WHERE id = $1`,
      [adId, ...entries.map(([, value]) => value)]
    );

    // Si l'écriture MongoDB échoue, l'exception annule aussi la modification SQL.
    if (cleanAttributes) {
      await AdDetails.updateOne(
        { adId },
        { $set: { attributes: cleanAttributes }, $setOnInsert: { categorySlug: ad.categorySlug } },
        { upsert: true }
      );
    }
  });

  return getAd(adId, userId);
}

// Supprime une photo : ligne SQL, puis fichiers. Les photos restantes sont renumérotées 0..n-1.
export async function removeImage(userId, adId, imageId) {
  const removed = await withTransaction(async (client) => {
    assertEditable(await lockOwnedAd(client, userId, adId));
    const { rows } = await client.query('DELETE FROM ad_images WHERE id = $1 AND ad_id = $2 RETURNING url, thumb_url', [imageId, adId]);
    if (rows.length === 0) throw new HttpError(404, 'IMAGE_NOT_FOUND', 'Photo introuvable');
    await client.query(
      `UPDATE ad_images i SET position = (r.rank - 1)::smallint
       FROM (SELECT id, row_number() OVER (ORDER BY position) AS rank FROM ad_images WHERE ad_id = $1) r
       WHERE i.id = r.id`,
      [adId]
    );
    return camelize(rows[0]);
  });
  // Les fichiers partent APRÈS le COMMIT : en cas d'échec, une photo orpheline sur le disque vaut mieux qu'une fiche cassée.
  for (const publicUrl of [removed.url, removed.thumbUrl]) {
    await rm(path.join(config.uploadDir, path.basename(publicUrl)), { force: true }).catch((error) => {
      console.error(`Suppression du fichier ${publicUrl} impossible : ${error.message}`);
    });
  }
}

// `ids` doit contenir exactement les photos de l'annonce, une fois chacune. Refus en bloc sinon.
// La contrainte UNIQUE (ad_id, position) est différée : on peut échanger des positions dans une même transaction.
export async function reorderImages(userId, adId, ids) {
  return withTransaction(async (client) => {
    assertEditable(await lockOwnedAd(client, userId, adId));
    const { rows } = await client.query('SELECT id FROM ad_images WHERE ad_id = $1', [adId]);
    const existing = rows.map((row) => row.id).sort();
    const wanted = ids.map((id) => id.toLowerCase()).sort();
    if (existing.length !== wanted.length || existing.some((id, index) => id !== wanted[index])) {
      throw new HttpError(400, 'INVALID_ORDER', "La liste doit contenir exactement les photos de l'annonce, une seule fois chacune");
    }
    for (const [position, id] of ids.entries()) {
      await client.query('UPDATE ad_images SET position = $1 WHERE id = $2 AND ad_id = $3', [position, id.toLowerCase(), adId]);
    }
    const { rows: ordered } = await client.query(
      'SELECT id, url, thumb_url, position FROM ad_images WHERE ad_id = $1 ORDER BY position',
      [adId]
    );
    return ordered.map(camelize);
  });
}

// Suppression logique : l'annonce garde ses lignes (ventes, signalements) mais disparaît partout.
export async function deleteAd(userId, adId) {
  await withTransaction(async (client) => {
    await lockOwnedAd(client, userId, adId);
    await client.query("UPDATE ads SET status = 'deleted', deleted_at = now() WHERE id = $1", [adId]);
  });
}

// `body` a déjà été validé par statusSchema. Vendre avec un `buyerId` enregistre la vente (table transactions).
export async function changeStatus(userId, adId, { status, buyerId }) {
  await withTransaction(async (client) => {
    const ad = await lockOwnedAd(client, userId, adId);
    if (!TRANSITIONS[ad.status].includes(status)) {
      throw new HttpError(409, 'INVALID_TRANSITION', `Une annonce « ${ad.status} » ne peut pas passer à « ${status} »`);
    }
    if (status === 'sold' && buyerId) {
      if (buyerId === userId) throw new HttpError(400, 'INVALID_BUYER', 'Vous ne pouvez pas être votre propre acheteur');
      // acheteur inconnu : la clé étrangère refuse (erreur 23503 -> 400 INVALID_REFERENCE) et tout est annulé
      await client.query(
        'INSERT INTO transactions (ad_id, seller_id, buyer_id, price_cents) VALUES ($1, $2, $3, $4)',
        [adId, userId, buyerId, ad.priceCents]
      );
    }
    // Republier (archivée ou brouillon -> active) remet l'annonce en tête des résultats.
    await client.query(
      `UPDATE ads
       SET status = $2::ad_status,
           published_at = CASE WHEN $2::text = 'active' AND status IN ('archived', 'draft') THEN now() ELSE published_at END
       WHERE id = $1`,
      [adId, status]
    );
  });
  return getAd(adId, userId);
}
