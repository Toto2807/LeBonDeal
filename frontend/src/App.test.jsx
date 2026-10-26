import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App.jsx';

// Pas de vraie API dans ce test : un visiteur non connecté.
vi.mock('./context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: null, loading: false, login: vi.fn(), logout: vi.fn() }),
}));

const renderAt = (path) => render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);

describe('routage de l\'application', () => {
  it('affiche l\'accueil et l\'en-tête sur /', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: /bonne affaire/i })).toBeInTheDocument();
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
