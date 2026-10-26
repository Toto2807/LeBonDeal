// Badge calculé par le serveur (price-hint.sql) : comparaison à la médiane des annonces actives de la catégorie.
// « unknown » = moins de 5 annonces comparables : on n'affiche rien plutôt qu'un avis sans fondement.
const HINTS = {
  good_deal: { text: 'Bon prix', className: 'bg-green-100 text-green-900' },
  fair: { text: 'Prix du marché', className: 'bg-gray-100 text-gray-800' },
  high: { text: 'Au-dessus du marché', className: 'bg-amber-100 text-amber-900' },
};

export default function PriceHint({ hint }) {
  const info = HINTS[hint];
  if (!info) return null;
  return (
    <span
      title="Comparé aux annonces actives de la même catégorie"
      className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${info.className}`}
    >
      {info.text}
    </span>
  );
}
