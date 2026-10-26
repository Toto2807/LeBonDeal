import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import Home from './Home.jsx';
import { api } from '../api/client.js';
import { adsPage, categories } from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: null }) }));

const Destination = () => {
  const { pathname, search } = useLocation();
  return <p>Recherche : {pathname}{search}</p>;
};
const renderHome = () =>
  renderApp(
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/recherche" element={<Destination />} />
    </Routes>
  );

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path) => (path === '/categories' ? { data: categories } : adsPage(4)));
});

describe('page d\'accueil', () => {
  it('affiche le titre, les catégories et les dernières annonces', async () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: /bonne affaire/i })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Véhicules' })).toHaveAttribute('href', '/recherche?category=vehicules');
    expect(await screen.findByRole('link', { name: /Annonce numéro 1/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dernières annonces' })).toBeInTheDocument();
    expect(api).toHaveBeenCalledWith('/ads', expect.objectContaining({ params: expect.objectContaining({ limit: 8 }) }));
  });

  it('montre des emplacements animés pendant le chargement', () => {
    api.mockImplementation(() => new Promise(() => {}));
    renderHome();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(8);
  });

  it('affiche un message lisible quand l\'API échoue, sans casser la page', async () => {
    api.mockImplementation(async (path) => {
      if (path === '/categories') return { data: categories };
      throw new Error('réseau coupé');
    });
    renderHome();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les annonces');
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('envoie le texte saisi vers la recherche', async () => {
    renderHome();
    await userEvent.type(screen.getByRole('searchbox', { name: /que cherchez-vous/i }), 'vélo électrique{Enter}');
    expect(await screen.findByText('Recherche : /recherche?q=v%C3%A9lo%20%C3%A9lectrique')).toBeInTheDocument();
  });

  it('mène à la recherche complète depuis « Voir toutes les annonces »', async () => {
    renderHome();
    const link = await screen.findByRole('link', { name: /voir toutes les annonces/i });
    expect(link).toHaveAttribute('href', '/recherche');
  });
});
