import { Link } from 'react-router';

// Accueil provisoire : la version complète (catégories, dernières annonces) est prévue en phase 1.
export default function Home() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-extrabold">Trouvez la bonne affaire près de chez vous</h1>
      <p className="mt-2 text-gray-600">La page d'accueil complète arrive en phase 1.</p>
      <Link to="/recherche" className="mt-6 inline-block rounded-lg bg-brand-500 px-5 py-3 font-semibold text-ink hover:bg-brand-400">
        Voir les annonces
      </Link>
    </section>
  );
}
