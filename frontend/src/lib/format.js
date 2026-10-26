// Les prix circulent en centimes (entiers) entre la base, l'API et le frontend : 12,50 € = 1250.
export function formatPrice(cents) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2, // « 150 € » mais « 12,50 € »
  }).format(cents / 100);
}

const relativeTime = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
const UNITS = [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3_600], ['minute', 60]];

// « il y a 3 heures », « hier », « il y a 2 mois »…
export function timeAgo(date) {
  const seconds = (new Date(date).getTime() - Date.now()) / 1000; // négatif = dans le passé
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeTime.format(Math.round(seconds / size), unit);
  }
  return "à l'instant";
}
