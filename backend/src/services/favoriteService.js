import { query } from '../config/postgres.js';

export async function listIds(userId) {
  const rows = await query('SELECT ad_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return rows.map((row) => row.adId);
}

// Idempotent : ajouter deux fois le même favori ne produit pas d'erreur (clé primaire composite + ON CONFLICT).
export async function add(userId, adId) {
  await query('INSERT INTO favorites (user_id, ad_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, adId]);
}

export async function remove(userId, adId) {
  await query('DELETE FROM favorites WHERE user_id = $1 AND ad_id = $2', [userId, adId]);
}
