import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useLocation } from 'react-router';
import Header from './Header.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { renderApp } from '../test/render.jsx';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

const logout = vi.fn();
const Where = () => {
  const { pathname, search } = useLocation();
  return <p>Page : {pathname}{search}</p>;
};
const renderHeader = () =>
  renderApp(<><Header /><Routes><Route path="*" element={<Where />} /></Routes></>);

beforeEach(() => {
  logout.mockReset();
  useAuth.mockReturnValue({ user: null, logout });
});

describe('Header : visiteur', () => {
  it('propose de déposer une annonce et de se connecter, sans espace compte', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'LeBonDeal' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Déposer une annonce' })).toHaveAttribute('href', '/deposer');
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute('href', '/connexion');
    expect(screen.queryByRole('button', { name: 'Déconnexion' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /mon compte/i })).not.toBeInTheDocument();
  });

  it('garde des cibles tactiles d\'au moins 44 px, y compris pour « Déposer une annonce » (visible aussi sur téléphone)', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Déposer une annonce' })).toHaveClass('min-h-11', 'min-w-11');
    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveClass('min-h-11');
  });
});

describe('Header : utilisateur connecté', () => {
  beforeEach(() => useAuth.mockReturnValue({ user: { id: 'u1', displayName: 'Marie' }, logout }));

  it('donne un nom accessible à chaque icône, y compris le compte (le prénom est masqué sur mobile)', () => {
    renderHeader();
    expect(screen.getByRole('link', { name: 'Mes favoris' })).toHaveAttribute('href', '/compte/favoris');
    expect(screen.getByRole('link', { name: 'Mes messages' })).toHaveAttribute('href', '/compte/messages');
    expect(screen.getByRole('link', { name: /Mon compte/ })).toHaveAttribute('href', '/compte');
    expect(screen.getByRole('link', { name: /Mon compte/ })).toHaveAccessibleName('Mon compte (Marie)');
  });

  it('déconnecte', async () => {
    renderHeader();
    await userEvent.click(screen.getByRole('button', { name: 'Déconnexion' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('a des cibles tactiles d\'au moins 44 px (classe min-h-11) pour chaque commande', () => {
    renderHeader();
    for (const control of [
      screen.getByRole('link', { name: 'Mes favoris' }),
      screen.getByRole('link', { name: 'Mes messages' }),
      screen.getByRole('link', { name: /Mon compte/ }),
      screen.getByRole('button', { name: 'Déconnexion' }),
    ]) {
      expect(control).toHaveClass('min-h-11');
    }
  });
});

describe('Header : recherche', () => {
  it('envoie le texte saisi vers la recherche, encodé', async () => {
    renderHeader();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher une annonce' }), 'vélo électrique{Enter}');
    expect(await screen.findByText('Page : /recherche?q=v%C3%A9lo%20%C3%A9lectrique')).toBeInTheDocument();
  });

  it('ouvre la recherche complète quand le champ est vide', async () => {
    renderHeader();
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher une annonce' }), '   {Enter}');
    expect(await screen.findByText('Page : /recherche')).toBeInTheDocument();
  });
});
