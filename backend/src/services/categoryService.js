import { query } from '../config/postgres.js';
import { CategorySchema } from '../models/CategorySchema.js';

// Arbre des catégories (PostgreSQL) : [{ id, slug, name, icon, children: [{ id, slug, name }] }]
export async function getCategoryTree() {
  const rows = await query('SELECT id, parent_id, slug, name, icon FROM categories ORDER BY position, id');
  const roots = rows
    .filter((category) => category.parentId === null)
    .map(({ id, slug, name, icon }) => ({ id, slug, name, icon, children: [] }));
  for (const { id, parentId, slug, name } of rows.filter((category) => category.parentId !== null)) {
    roots.find((root) => root.id === parentId).children.push({ id, slug, name });
  }
  return roots;
}

// Champs dynamiques d'une catégorie (MongoDB). Catégorie sans champ particulier : liste vide.
export async function getCategorySchema(slug) {
  const definition = await CategorySchema.findOne({ categorySlug: slug }).lean();
  return { categorySlug: slug, fields: definition?.fields ?? [] };
}
