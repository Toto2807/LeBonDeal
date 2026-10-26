import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import Register from './Register.jsx';
import { ApiError, api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { renderApp } from '../test/render.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));

const login = vi.fn();
const renderRegister = () =>
  renderApp(
    <Routes>
      <Route path="/inscription" element={<Register />} />
      <Route path="/" element={<p>Page d'accueil</p>} />
    </Routes>,
    { entries: ['/inscription'] }
  );
const fill = async ({ name = 'Marie', email = 'marie@test.fr', password = 'motdepasse' } = {}) => {
  await userEvent.type(screen.getByLabelText('Prénom ou pseudo'), name);
  await userEvent.type(screen.getByLabelText('Adresse e-mail'), email);
  await userEvent.type(screen.getByLabelText('Mot de passe'), password);
  await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
};

beforeEach(() => {
  login.mockReset();
  api.mockReset();
  useAuth.mockReturnValue({ user: null, loading: false, login });
});

describe('page d\'inscription', () => {
  it('indique la règle du mot de passe et le bon type de saisie', () => {
    renderRegister();
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByText(/8 caractères minimum/i)).toBeInTheDocument();
  });

  it('refuse un mot de passe de moins de 8 caractères sans appeler le serveur', async () => {
    renderRegister();
    await fill({ password: 'court' });
    expect(await screen.findByText(/au moins 8 caractères/i)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });

  it('refuse un pseudo trop court et une adresse invalide', async () => {
    renderRegister();
    await fill({ name: 'M', email: 'pas-un-email' });
    expect(await screen.findByText('Adresse e-mail invalide')).toBeInTheDocument();
    expect(screen.getByText(/au moins 2 caractères/i)).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('crée le compte puis connecte automatiquement', async () => {
    api.mockResolvedValue({ data: { id: 'u1' } });
    login.mockResolvedValue(undefined);
    renderRegister();
    await fill();
    expect(api).toHaveBeenCalledWith('/auth/register', {
      method: 'POST',
      body: { email: 'marie@test.fr', password: 'motdepasse', displayName: 'Marie' },
    });
    expect(login).toHaveBeenCalledWith({ email: 'marie@test.fr', password: 'motdepasse' });
    expect(await screen.findByText("Page d'accueil")).toBeInTheDocument();
  });

  it('signale une adresse e-mail déjà utilisée sous le champ concerné', async () => {
    api.mockRejectedValue(new ApiError(409, { error: { code: 'ALREADY_EXISTS', message: 'Cette valeur existe déjà' } }));
    renderRegister();
    await fill();
    expect(await screen.findByText('Cette adresse e-mail est déjà utilisée')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('affiche un message clair quand le serveur est injoignable', async () => {
    api.mockRejectedValue(new TypeError('Failed to fetch'));
    renderRegister();
    await fill();
    expect(await screen.findByRole('alert')).toHaveTextContent('Inscription impossible');
  });
});
