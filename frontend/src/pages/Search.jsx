import { useAdSearch } from '../hooks/useAdSearch.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import AdGrid from '../components/ads/AdGrid.jsx';
import FilterPanel from '../components/ads/FilterPanel.jsx';
import Pagination from '../components/ui/Pagination.jsx';

// Réponse de GET /api/ads : { data: [annonces], meta: { total, page, limit } }
export default function Search() {
  usePageTitle('Recherche');
  const { filters, setFilters, data, isPending, isError, isPlaceholderData } = useAdSearch();
  const page = Number(filters.page ?? 1);
  const pageCount = data ? Math.ceil(data.meta.total / data.meta.limit) : 0;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[18rem_1fr]">
      <FilterPanel filters={filters} setFilters={setFilters} />

      <section aria-live="polite" className={isPlaceholderData ? 'opacity-60 transition' : 'transition'}>
        {isPending && <AdGrid loading />}
        {isError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">Impossible de charger les annonces. Réessayez dans un instant.</p>}

        {data && (
          <>
            <h1 className="mb-4 text-xl font-bold">
              {data.meta.total} annonce{data.meta.total > 1 ? 's' : ''}{filters.q && ` pour « ${filters.q} »`}
            </h1>
            <AdGrid ads={data.data} emptyMessage="Aucune annonce ne correspond. Essayez d'élargir votre recherche." />
            <Pagination page={page} pageCount={pageCount} onPage={(next) => setFilters({ page: next })} />
          </>
        )}
      </section>
    </div>
  );
}
