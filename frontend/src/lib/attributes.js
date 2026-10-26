const numberFormat = new Intl.NumberFormat('fr-FR');

// Valeur d'un champ dynamique (MongoDB) telle qu'on la montre à l'utilisateur.
// Les milliers ne sont séparés que pour une quantité avec unité (« 80 000 km », « 1 024 Go ») : jamais pour une année
// (« 2019 »), un nombre de pièces ou une pointure.
export function formatAttributeValue(value, field) {
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (typeof value === 'number') return field?.unit ? `${numberFormat.format(value)} ${field.unit}` : String(value);
  return String(value);
}
