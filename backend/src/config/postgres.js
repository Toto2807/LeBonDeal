import pg from 'pg';
import { config } from './env.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

// Les colonnes SQL sont en snake_case, l'API JSON en camelCase : price_cents -> priceCents
const toCamel = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
export const camelize = (row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [toCamel(key), value]));

// Toujours des requêtes paramétrées ($1, $2…) : jamais de valeur concaténée dans le texte SQL.
export async function query(text, params) {
  const { rows } = await pool.query(text, params);
  return rows.map(camelize);
}

// Exécute `work(client)` dans une transaction : COMMIT si tout va bien, ROLLBACK si une exception est levée.
export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
