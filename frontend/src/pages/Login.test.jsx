import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import Login from './Login.jsx';
import { ApiError } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { renderApp } from '../test/render.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

const login = vi.fn();
const renderLogin = (entries = ['/connexion']) =>
  renderApp(
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route path="/" element={<p>Page d'accueil</p>} />
      <Route path="/deposer" element={<p>Page de dépôt</p>} />
    </Routes>,
    { entries }
  );
const fill = async (email, password) => {
  await userEvent.type(screen.getByLabelText('Adresse e-mail'), email);
  await userEvent.type(screen.getByLabelText('Mot de passe'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
};

beforeEach(() => {
  login.mockReset();
  useAuth.mockReturnValue({ user: null, loading: false, login });
});

describe('page de connexion', () => {
  it('affiche le formulaire avec les bons types de saisie', () => {
    renderLogin();
    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse e-mail')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('link', { name: /créer un compte/i })).toHaveAttribute('href', '/inscription');
  });

  it('vérifie les champs avant tout appel réseau', async () => {
    renderLogin();
    await userEvent.type(screen.getByLabelText('Adresse e-mail'), 'pas-un-email');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Adresse e-mail invalide')).toBeInTheDocument();
    expect(screen.getByText('Mot de passe requis')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('affiche le message du serveur pour de mauvais identifiants', async () => {
    login.mockRejectedValue(new ApiError(401, { error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou mot de passe incorrect' } }));
    renderLogin();
    await fill('marie@test.fr', 'mauvais-mot-de-passe');
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect');
  });

  it('affiche un message clair quand le réseau est coupé', async () => {
    login.mockRejectedValue(new TypeError('Failed to fetch'));
    renderLogin();
    await fill('marie@test.fr', 'motdepasse');
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion impossible');
  });

  it('connecte puis renvoie à l\'accueil par défaut', async () => {
    login.mockResolvedValue(undefined);
    renderLogin();
    await fill('marie@test.fr', 'motdepasse');
    expect(login).toHaveBeenCalledWith({ email: 'marie@test.fr', password: 'motdepasse' });
    expect(await screen.findByText("Page d'accueil")).toBeInTheDocument();
  });

  it('renvoie à la page d\'origine quand la connexion était demandée par une page protégée', async () => {
    login.mockResolvedValue(undefined);
    renderLogin([{ pathname: '/connexion', state: { from: { pathname: '/deposer', search: '' } } }]);
    await fill('marie@test.fr', 'motdepasse');
    expect(await screen.findByText('Page de dépôt')).toBeInTheDocument();
  });

  it('redirige un utilisateur déjà connecté', () => {
    useAuth.mockReturnValue({ user: { id: 'u1', displayName: 'Marie' }, loading: false, login });
    renderLogin();
    expect(screen.getByText("Page d'accueil")).toBeInTheDocument();
  });
});
