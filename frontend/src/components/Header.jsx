import { Link, useNavigate } from 'react-router';
import { Heart, MessageCircle, Plus, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onSearch(event) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q').trim();
    navigate(q ? `/recherche?q=${encodeURIComponent(q)}` : '/recherche');
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="text-xl font-extrabold text-brand-700">LeBonDeal</Link>

        <Link
          to="/deposer"
          className="hidden items-center gap-1 rounded-lg bg-brand-500 px-4 py-2 font-semibold text-ink hover:bg-brand-400 sm:inline-flex"
        >
          <Plus size={18} aria-hidden="true" /> Déposer une annonce
        </Link>

        <form onSubmit={onSearch} role="search" className="min-w-0 flex-1">
          <input
            name="q"
            type="search"
            placeholder="Que recherchez-vous ?"
            aria-label="Rechercher une annonce"
            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2"
          />
        </form>

        <nav aria-label="Navigation principale" className="flex items-center gap-4 text-sm">
          {user ? (
            <>
              <Link to="/compte/favoris" aria-label="Mes favoris"><Heart size={22} /></Link>
              <Link to="/compte/messages" aria-label="Mes messages"><MessageCircle size={22} /></Link>
              <Link to="/compte" className="inline-flex items-center gap-1 font-medium">
                <User size={22} aria-hidden="true" /> <span className="hidden md:inline">{user.displayName}</span>
              </Link>
              <button type="button" onClick={logout} className="text-gray-500 hover:text-ink">Déconnexion</button>
            </>
          ) : (
            <Link to="/connexion" className="font-medium">Se connecter</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
