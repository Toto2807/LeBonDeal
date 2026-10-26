import { NavLink, Outlet } from 'react-router';

// [adresse, libellé, `end`] : « Mes annonces » est à /compte, et ne doit pas rester « courante » sur /compte/favoris.
const LINKS = [
  ['/compte', 'Mes annonces', true],
  ['/compte/favoris', 'Favoris'],
  ['/compte/messages', 'Messages'],
  ['/compte/profil', 'Profil'],
];

// Cadre de l'espace « Mon compte » : titre, menu, puis la sous-page dans <Outlet />.
// NavLink pose lui-même aria-current="page" sur le lien de la page courante.
export default function AccountLayout() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold">Mon compte</h1>
      <nav aria-label="Mon compte" className="my-4 flex gap-2 overflow-x-auto border-b border-gray-200 pb-3">
        {LINKS.map(([to, label, end]) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `min-h-11 whitespace-nowrap rounded-lg px-4 py-2 font-medium ${isActive ? 'bg-brand-100 text-ink' : 'text-gray-600 hover:bg-gray-100'}`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
