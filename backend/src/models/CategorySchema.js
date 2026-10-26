import mongoose from 'mongoose';

// Définition des champs dynamiques d'une catégorie (lecture seule côté application).
const categorySchemaSchema = new mongoose.Schema(
  {
    categorySlug: { type: String, required: true },
    fields: [mongoose.Schema.Types.Mixed], // { key, label, type, required, filterable, options, unit, min, max }
  },
  { collection: 'category_schemas' }
);

export const CategorySchema = mongoose.model('CategorySchema', categorySchemaSchema);
