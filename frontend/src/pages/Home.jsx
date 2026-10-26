import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import { api } from '../api/client.js';
import AdGrid from '../components/ads/AdGrid.jsx';
import CategoryGrid from '../components/ads/CategoryGrid.jsx';
import Button from '../components/ui/Button.jsx';
import { useCategories } from '../hooks/useCategories.js';

const GRID = 'grid grid-cols-2 gap-4 md:grid-cols-4';

export default function Home() {
  const navigate = useNavigate();
  const { data: categories } = useCategories();
  const recent = useQuery({
    queryKey: ['ads', 'recent'],
    queryFn: ({ signal }) => api('/ads', { params: { limit: 8 }, signal }),
  });

  function onSearch(event) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q').trim();
    navigate(q ? `/recherche?q=${encodeURIComponent(q)}` : '/recherche');
  }

  return (
    <>
      <section className="bg-brand-100">
        <div className="mx-auto max-w-6xl px-4 py-10 text-center">
          <h1 className="text-3xl font-extrabold sm:text-4xl">Trouvez la bonne affaire près de chez vous</h1>
          <form onSubmit={onSearch} role="search" className="mx-auto mt-6 flex max-w-xl gap-2">
            <label htmlFor="home-search" className="sr-only">Que cherchez-vous ?</label>
            <input
              id="home-search"
              name="q"
              type="search"
              placeholder="Que cherchez-vous ?"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-4 py-3"
            />
            <Button type="submit">Rechercher</Button>
          </form>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        <CategoryGrid categories={categories} />

        <section aria-labelledby="recent-title">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 id="recent-title" className="text-xl font-bold">Dernières annonces</h2>
            <Link to="/recherche" className="font-medium text-brand-700 underline">Voir toutes les annonces</Link>
          </div>
          {recent.isError ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
              Impossible de charger les annonces. Réessayez dans un instant.
            </p>
          ) : (
            <AdGrid ads={recent.data?.data} loading={recent.isPending} className={GRID} />
          )}
        </section>
      </div>
    </>
  );
}
