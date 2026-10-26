import Skeleton from '../ui/Skeleton.jsx';
import AdCard from './AdCard.jsx';

const DEFAULT_GRID = 'grid grid-cols-2 gap-4 md:grid-cols-3';

// Liste d'annonces avec ses trois états : chargement (squelettes), vide (message), résultats.
export default function AdGrid({ ads = [], loading = false, emptyMessage = 'Aucune annonce pour le moment.', className = DEFAULT_GRID }) {
  if (loading) {
    return (
      <ul aria-busy="true" className={className}>
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index}>
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="mt-2 h-5 w-1/3" />
          </li>
        ))}
      </ul>
    );
  }
  if (ads.length === 0) {
    return <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">{emptyMessage}</p>;
  }
  return (
    <ul className={className}>
      {ads.map((ad) => <li key={ad.id}><AdCard ad={ad} /></li>)}
    </ul>
  );
}
