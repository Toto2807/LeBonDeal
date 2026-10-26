import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import AdGrid from './AdGrid.jsx';
import { adCard } from '../../test/fixtures.js';
import { renderApp } from '../../test/render.jsx';

vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: null }) }));

describe('AdGrid', () => {
  it('affiche 8 emplacements animés pendant le chargement', () => {
    renderApp(<AdGrid loading />);
    expect(screen.getByRole('list')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('affiche le message personnalisé quand il n\'y a aucune annonce', () => {
    renderApp(<AdGrid ads={[]} emptyMessage="Rien à voir ici." />);
    expect(screen.getByText('Rien à voir ici.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('a un message par défaut', () => {
    renderApp(<AdGrid ads={[]} />);
    expect(screen.getByText(/aucune annonce/i)).toBeInTheDocument();
  });

  it('affiche une carte cliquable par annonce', () => {
    const ads = [adCard(1), adCard(2)];
    renderApp(<AdGrid ads={ads} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Annonce numéro 1/ })).toHaveAttribute('href', `/annonces/${ads[0].id}`);
    expect(screen.getByRole('link', { name: /Annonce numéro 2/ })).toHaveAttribute('href', `/annonces/${ads[1].id}`);
  });
});
