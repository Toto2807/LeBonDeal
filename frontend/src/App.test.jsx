import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import App from './App.jsx';
import { api } from './api/client.js';
import { adsPage, categories } from './test/fixtures.js';
import { renderApp } from './test/render.jsx';

// Pas de vraie API dans ce test : un visiteur non connecté, et des réponses simulées.
vi.mock('./api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));
vi.mock('./context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: null, loading: false, login: vi.fn(), logout: vi.fn() }),
}));

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (path) => (path === '/categories' ? { data: categories } : adsPage(2)));
});

const renderAt = (path) => renderApp(<App />, { entries: [path] });

describe('routage de l\'application', () => {
  it('affiche l\'accueil et l\'en-tête sur /', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1, name: /bonne affaire/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LeBonDeal' })).toBeInTheDocument();
  });

  it('affiche une page 404 pour une adresse inconnue', async () => {
    renderAt('/cette-page-n-existe-pas');
    expect(await screen.findByRole('heading', { name: /page introuvable/i })).toBeInTheDocument();
  });

  it('renvoie un visiteur non connecté de /compte vers la connexion', async () => {
    renderAt('/compte');
    expect(await screen.findByRole('heading', { name: /connexion/i })).toBeInTheDocument();
  });
});
