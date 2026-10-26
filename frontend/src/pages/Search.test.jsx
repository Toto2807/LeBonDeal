import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import Search from './Search.jsx';
import { api } from '../api/client.js';
import { adsPage, categories } from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: null }) }));

const renderSearch = (url = '/recherche') =>
  renderApp(<Routes><Route path="/recherche" element={<Search />} /></Routes>, { entries: [url] });
const respondWith = (ads) =>
  api.mockImplementation(async (path) => {
    if (path === '/categories') return { data: categories };
    if (path.startsWith('/categories/')) return { data: { categorySlug: 'velos', fields: [] } };
    return ads;
  });
const adCalls = () => api.mock.calls.filter(([path]) => path === '/ads');

// Les accolades comptent : un beforeEach qui RENVOIE une fonction la fait exécuter comme nettoyage (ici api() sans argument).
beforeEach(() => {
  api.mockReset();
});

describe('page de recherche', () => {
  it('affiche le nombre de résultats et les annonces', async () => {
    respondWith(adsPage(3, { total: 3 }));
    renderSearch('/recherche?q=velo');
    expect(await screen.findByRole('heading', { name: /3 annonces pour « velo »/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Annonce numéro/ })).toHaveLength(3);
    expect(adCalls()[0][1].params).toEqual({ q: 'velo' });
  });

  it('montre des emplacements pendant le chargement', () => {
    api.mockImplementation(() => new Promise(() => {}));
    renderSearch();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(8);
  });

  it('affiche un message quand rien ne correspond', async () => {
    respondWith(adsPage(0, { total: 0 }));
    renderSearch('/recherche?q=introuvable');
    expect(await screen.findByText(/aucune annonce ne correspond/i)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  it('affiche une erreur lisible quand l\'API échoue', async () => {
    api.mockImplementation(async (path) => {
      if (path === '/categories') return { data: categories };
      throw new Error('réseau coupé');
    });
    renderSearch();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les annonces');
  });

  it('pagine : « Suivant » demande la page 2', async () => {
    respondWith(adsPage(20, { total: 45, limit: 20 }));
    renderSearch();
    expect(await screen.findByText('Page 1 sur 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByText('Page 2 sur 3')).toBeInTheDocument();
    expect(adCalls().at(-1)[1].params).toEqual({ page: '2' });
  });
});
