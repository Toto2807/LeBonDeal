import { formatAttributeValue as formatValue } from '../../lib/attributes.js';

const hasValue = (value) => value != null && value !== '';

// attributes : valeurs de la fiche Mongo (ad_details) · fields : définition de la catégorie (libellés, unités, ordre).
// Sans définition (chargement, échec) ou pour un champ qui n'existe plus, on affiche la clé et la valeur brutes.
export default function AdAttributes({ attributes = {}, fields }) {
  const defined = fields ?? [];
  const definedKeys = new Set(defined.map((field) => field.key));
  const rows = [
    ...defined
      .filter((field) => hasValue(attributes[field.key]))
      .map((field) => ({ key: field.key, label: field.label, value: formatValue(attributes[field.key], field) })),
    ...Object.keys(attributes)
      .filter((key) => !definedKeys.has(key) && hasValue(attributes[key]))
      .map((key) => ({ key, label: key, value: formatValue(attributes[key]) })),
  ];
  if (rows.length === 0) return null;

  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.key} className="flex justify-between gap-4 border-b border-gray-100 py-2">
          <dt className="text-gray-600">{row.label}</dt>
          <dd className="font-medium">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
