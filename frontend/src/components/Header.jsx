import { Link, useNavigate } from 'react-router';
import { Heart, LogOut, MessageCircle, Plus, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

// Cible tactile d'au moins 44 px de haut (recommandation WCAG / Apple), icône ou texte centré.
const TAP = 'inline-flex min-h-11 items-center justify-center';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function onSearch(event) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q').trim();
    navigate(q ? `/recherche?q=${encodeURIComponent(q)}` : '/recherche');
  }

  // Téléphone : 1re ligne logo + navigation, 2e ligne recherche + « Déposer » (les `order-*` réordonnent sans toucher au DOM).
  // À partir de `md` : tout sur une ligne, dans l'ordre logo · Déposer · recherche · navigation.
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:flex-nowrap">
        <Link to="/" className="order-1 text-xl font-extrabold text-brand-700">LeBonDeal</Link>

        <Link
          to="/deposer"
          aria-label="Déposer une annonce"
          className={`${TAP} order-4 min-w-11 gap-1 rounded-lg bg-brand-500 px-3 font-semibold text-ink hover:bg-brand-400 sm:px-4 md:order-2`}
        >
          <Plus size={18} aria-hidden="true" /> <span className="hidden sm:inline">Déposer une annonce</span>
        </Link>

        <form onSubmit={onSearch} role="search" className="order-3 min-w-0 flex-1 basis-48">
          <input
            name="q"
            type="search"
            placeholder="Que recherchez-vous ?"
            aria-label="Rechercher une annonce"
            className="min-h-11 w-full rounded-lg border border-gray-300 bg-gray-50 px-4 py-2"
          />
        </form>

        <nav aria-label="Navigation principale" className="order-2 ml-auto flex items-center gap-1 text-sm md:order-4 md:ml-0 md:gap-3">
          {user ? (
            <>
              <Link to="/compte/favoris" aria-label="Mes favoris" className={`${TAP} min-w-11`}><Heart size={22} aria-hidden="true" /></Link>
              <Link to="/compte/messages" aria-label="Mes messages" className={`${TAP} min-w-11`}><MessageCircle size={22} aria-hidden="true" /></Link>
              {/* Sur mobile le prénom est masqué : le nom accessible doit donc être posé sur le lien lui-même. */}
              <Link to="/compte" aria-label={`Mon compte (${user.displayName})`} className={`${TAP} min-w-11 gap-1 font-medium`}>
                <User size={22} aria-hidden="true" /> <span className="hidden lg:inline">{user.displayName}</span>
              </Link>
              <button type="button" onClick={logout} aria-label="Déconnexion" className={`${TAP} min-w-11 gap-1 text-gray-600 hover:text-ink`}>
                <LogOut size={22} aria-hidden="true" /> <span className="hidden lg:inline">Déconnexion</span>
              </button>
            </>
          ) : (
            <Link to="/connexion" className={`${TAP} px-2 font-medium`}>Se connecter</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
