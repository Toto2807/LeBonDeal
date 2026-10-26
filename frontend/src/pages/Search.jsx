import { useAdSearch } from '../hooks/useAdSearch.js';
import AdCard from '../components/ads/AdCard.jsx';
import FilterPanel from '../components/ads/FilterPanel.jsx';

// Réponse de GET /api/ads : { data: [annonces], meta: { total, page, limit } }
export default function Search() {
  const { filters, setFilters, data, isPending, isError, isPlaceholderData } = useAdSearch();
  const page = Number(filters.page ?? 1);
  const pageCount = data ? Math.ceil(data.meta.total / data.meta.limit) : 0;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[18rem_1fr]">
      <FilterPanel filters={filters} setFilters={setFilters} />

      <section aria-live="polite" className={isPlaceholderData ? 'opacity-60 transition' : 'transition'}>
        {isPending && <p>Chargement des annonces…</p>}
        {isError && <p role="alert" className="text-red-600">Impossible de charger les annonces. Réessayez dans un instant.</p>}

        {data && (
          <>
            <h1 className="mb-4 text-xl font-bold">
              {data.meta.total} annonce{data.meta.total > 1 ? 's' : ''}{filters.q && ` pour « ${filters.q} »`}
            </h1>

            {data.data.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-500">
                Aucune annonce ne correspond. Essayez d'élargir votre recherche.
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {data.data.map((ad) => <li key={ad.id}><AdCard ad={ad} /></li>)}
              </ul>
            )}

            {pageCount > 1 && (
              <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-4">
                <button type="button" disabled={page <= 1} onClick={() => setFilters({ page: page - 1 })} className="rounded-lg border px-4 py-2 disabled:opacity-40">Précédent</button>
                <span>Page {page} sur {pageCount}</span>
                <button type="button" disabled={page >= pageCount} onClick={() => setFilters({ page: page + 1 })} className="rounded-lg border px-4 py-2 disabled:opacity-40">Suivant</button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  );
}
