// Saisie d'un prix en euros -> centimes entiers. Retourne null si l'entrée est vide, négative, non numérique
// ou a plus de 2 décimales. Aucun calcul en virgule flottante : « 19,99 » donne exactement 1999.
export function eurosToCents(input) {
  const text = String(input ?? '').replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [euros, decimals = ''] = text.split('.');
  return Number(euros) * 100 + Number(decimals.padEnd(2, '0'));
}

// Centimes -> texte à mettre dans un champ de saisie : 1250 -> « 12,50 », 15000 -> « 150 ».
export function centsToEuros(cents) {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros},${String(rest).padStart(2, '0')}`;
}
