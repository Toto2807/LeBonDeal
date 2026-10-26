import { z } from 'zod';

// Construit le schéma de validation des champs dynamiques d'une catégorie
// à partir du document de la collection category_schemas (MongoDB).
// Le client n'est jamais cru : un champ inconnu ou une valeur hors liste est refusé.
export function buildAttributesSchema(fields) {
  const shape = {};
  for (const field of fields) {
    let rule;
    if (field.type === 'number') {
      rule = z.number();
      if (field.min != null) rule = rule.min(field.min);
      if (field.max != null) rule = rule.max(field.max);
    } else if (field.type === 'boolean') {
      rule = z.boolean();
    } else if (field.type === 'select') {
      rule = z.enum(field.options);
    } else {
      rule = z.string().trim().max(120);
    }
    shape[field.key] = field.required ? rule : rule.optional();
  }
  return z.strictObject(shape);
}

// Transforme les paramètres de recherche ?attr.* en filtre MongoDB.
// raw : { carburant: 'Diesel,Hybride', 'kilometrage.max': '100000', meuble: 'true' }
// Seuls les champs `filterable` de la catégorie sont pris en compte et chaque valeur est convertie en type simple
// (texte, nombre, booléen) : un client ne peut pas injecter d'opérateur Mongo comme { "$ne": null }.
export function buildAttributesFilter(fields, raw) {
  const filter = {};
  for (const field of fields.filter((f) => f.filterable)) {
    const path = `attributes.${field.key}`;
    if (field.type === 'number') {
      const range = {};
      const min = Number(raw[`${field.key}.min`]);
      const max = Number(raw[`${field.key}.max`]);
      if (raw[`${field.key}.min`] != null && !Number.isNaN(min)) range.$gte = min;
      if (raw[`${field.key}.max`] != null && !Number.isNaN(max)) range.$lte = max;
      if (Object.keys(range).length > 0) filter[path] = range;
    } else if (field.type === 'boolean' && raw[field.key] != null) {
      filter[path] = String(raw[field.key]) === 'true';
    } else if (field.type === 'select' && raw[field.key]) {
      filter[path] = { $in: String(raw[field.key]).split(',') };
    } else if (field.type === 'text' && raw[field.key]) {
      filter[path] = String(raw[field.key]);
    }
  }
  return filter;
}
