import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import AccountLayout from './AccountLayout.jsx';
import { renderApp } from '../../test/render.jsx';

const renderAt = (path) =>
  renderApp(
    <Routes>
      <Route path="compte" element={<AccountLayout />}>
        <Route index element={<p>Contenu des annonces</p>} />
        <Route path="favoris" element={<p>Contenu des favoris</p>} />
      </Route>
    </Routes>,
    { entries: [path] }
  );

describe('AccountLayout', () => {
  it('affiche le titre, le menu du compte et la page demandée', () => {
    renderAt('/compte/favoris');
    expect(screen.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeInTheDocument();
    const menu = screen.getByRole('navigation', { name: 'Mon compte' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mes annonces' })).toHaveAttribute('href', '/compte');
    expect(screen.getByRole('link', { name: 'Favoris' })).toHaveAttribute('href', '/compte/favoris');
    expect(screen.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/compte/messages');
    expect(screen.getByRole('link', { name: 'Profil' })).toHaveAttribute('href', '/compte/profil');
    expect(screen.getByText('Contenu des favoris')).toBeInTheDocument();
  });

  it('indique la page courante, et une seule', () => {
    renderAt('/compte/favoris');
    expect(screen.getByRole('link', { name: 'Favoris' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Mes annonces' })).not.toHaveAttribute('aria-current');
  });

  it('ne considère « Mes annonces » comme courante que sur /compte exactement', () => {
    renderAt('/compte');
    expect(screen.getByRole('link', { name: 'Mes annonces' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Contenu des annonces')).toBeInTheDocument();
  });
});
