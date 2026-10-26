import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import FavoriteButton from './FavoriteButton.jsx';
import { ApiError, api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { renderApp } from '../../test/render.jsx';

vi.mock('../../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

const AD = 'ad-1';
const renderButton = () =>
  renderApp(
    <Routes>
      <Route path="/" element={<FavoriteButton adId={AD} />} />
      <Route path="/connexion" element={<p>Page de connexion</p>} />
    </Routes>
  );
const serve = ({ ids = [], write } = {}) =>
  api.mockImplementation(async (path, options = {}) => {
    if (path === '/favorites/ids') return { data: ids };
    if (path === `/favorites/${AD}`) return write ? write(options) : null;
    throw new Error(`appel inattendu : ${path}`);
  });
const writes = () => api.mock.calls.filter(([path]) => path === `/favorites/${AD}`);

beforeEach(() => {
  api.mockReset();
  useAuth.mockReset();
  useAuth.mockReturnValue({ user: { id: 'u1' } });
  serve();
});

describe('FavoriteButton', () => {
  it('renvoie un visiteur vers la connexion sans appeler l\'API', async () => {
    useAuth.mockReturnValue({ user: null });
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));
    expect(screen.getByText('Page de connexion')).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('a une cible tactile d\'au moins 44 px', () => {
    renderButton();
    expect(screen.getByRole('button', { name: 'Ajouter aux favoris' })).toHaveClass('size-11');
  });

  it('indique l\'état courant : pas favori, puis favori', async () => {
    serve({ ids: [AD] });
    renderButton();
    expect(await screen.findByRole('button', { name: 'Retirer des favoris' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ajoute aux favoris avec PUT, et le cœur change tout de suite (mise à jour optimiste)', async () => {
    serve({ write: () => new Promise(() => {}) }); // le serveur ne répond pas encore
    renderButton();
    await waitFor(() => expect(api).toHaveBeenCalledWith('/favorites/ids'));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));
    expect(writes()[0]).toEqual([`/favorites/${AD}`, { method: 'PUT' }]);
    expect(screen.getByRole('button', { name: 'Retirer des favoris' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ne plante pas si on clique avant la fin du chargement de la liste', async () => {
    api.mockImplementation((path) => (path === '/favorites/ids' ? new Promise(() => {}) : Promise.resolve(null)));
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));
    expect(await screen.findByRole('button', { name: 'Retirer des favoris' })).toBeInTheDocument();
    expect(writes()[0]).toEqual([`/favorites/${AD}`, { method: 'PUT' }]);
  });

  it('retire des favoris avec DELETE', async () => {
    serve({ ids: [AD] });
    renderButton();
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer des favoris' }));
    expect(writes()[0]).toEqual([`/favorites/${AD}`, { method: 'DELETE' }]);
  });

  it('revient en arrière quand le serveur refuse', async () => {
    serve({ write: () => { throw new ApiError(500, { error: { code: 'INTERNAL', message: 'Erreur' } }); } });
    renderButton();
    await waitFor(() => expect(api).toHaveBeenCalledWith('/favorites/ids'));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ajouter aux favoris' })).toHaveAttribute('aria-pressed', 'false'));
  });
});
