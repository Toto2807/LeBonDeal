import { Star } from 'lucide-react';
import { Link } from 'react-router';

const memberSince = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const rating = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// seller : { id, displayName, memberSince, ratingAvg (null sans avis), ratingCount, activeAdsCount }. Jamais d'e-mail.
export default function SellerCard({ seller }) {
  const count = seller.activeAdsCount;
  return (
    <section aria-label="Vendeur" className="rounded-xl border border-gray-200 bg-white p-4">
      <Link to={`/vendeur/${seller.id}`} className="text-lg font-bold hover:underline">{seller.displayName}</Link>
      <p className="mt-1 text-sm text-gray-600">Membre depuis {memberSince.format(new Date(seller.memberSince))}</p>
      {seller.ratingCount > 0 ? (
        <p className="mt-2 flex items-center gap-2">
          <Star size={18} aria-hidden="true" className="fill-brand-600 text-brand-600" />
          <span className="font-semibold">{rating.format(seller.ratingAvg)} / 5</span>
          <span className="text-sm text-gray-600">({seller.ratingCount} avis)</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-600">Pas encore d'avis</p>
      )}
      <p className="mt-2 text-sm text-gray-600">{count} annonce{count > 1 ? 's' : ''} en ligne</p>
    </section>
  );
}
