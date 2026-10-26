import { Link } from 'react-router';
import { categoryIcon } from '../../lib/categoryIcons.js';

// categories : l'arbre renvoyé par GET /api/categories ; on affiche les catégories racine.
export default function CategoryGrid({ categories }) {
  if (!categories?.length) return null;
  return (
    <nav aria-label="Catégories">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {categories.map((category) => {
          const Icon = categoryIcon(category.icon);
          return (
            <li key={category.id}>
              <Link
                to={`/recherche?category=${category.slug}`}
                className="flex h-full flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white p-4 text-center text-sm font-medium transition hover:border-brand-500 hover:shadow-sm"
              >
                <Icon size={28} aria-hidden="true" className="text-brand-700" />
                {category.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
