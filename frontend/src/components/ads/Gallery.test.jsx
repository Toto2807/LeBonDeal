import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Gallery from './Gallery.jsx';
import { adDetail } from '../../test/fixtures.js';

const { images } = adDetail();
const mainImage = () => screen.getByRole('img', { name: /Peugeot 208 — photo/ });

describe('Gallery', () => {
  it('affiche la première photo en grand et une miniature par photo', () => {
    render(<Gallery images={images} title="Peugeot 208" />);
    expect(mainImage()).toHaveAttribute('src', '/uploads/a.webp');
    expect(mainImage()).toHaveAccessibleName('Peugeot 208 — photo 1 sur 3');
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Voir la photo 1 sur 3' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('change la photo principale au clic sur une miniature', async () => {
    render(<Gallery images={images} title="Peugeot 208" />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir la photo 2 sur 3' }));
    expect(mainImage()).toHaveAttribute('src', '/uploads/b.webp');
    expect(screen.getByRole('button', { name: 'Voir la photo 2 sur 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Voir la photo 1 sur 3' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('se commande au clavier', async () => {
    render(<Gallery images={images} title="Peugeot 208" />);
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Voir la photo 2 sur 3' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(mainImage()).toHaveAttribute('src', '/uploads/b.webp');
  });

  it('n\'affiche pas de miniatures pour une seule photo', () => {
    render(<Gallery images={images.slice(0, 1)} title="Peugeot 208" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(mainImage()).toHaveAttribute('src', '/uploads/a.webp');
  });

  it('affiche un emplacement « Pas de photo » quand il n\'y en a aucune', () => {
    render(<Gallery images={[]} title="Peugeot 208" />);
    expect(screen.getByText('Pas de photo')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('reste valide si la liste de photos raccourcit (photo supprimée pendant la consultation)', () => {
    const { rerender } = render(<Gallery images={images} title="Peugeot 208" />);
    rerender(<Gallery images={images.slice(0, 1)} title="Peugeot 208" />);
    expect(mainImage()).toHaveAttribute('src', '/uploads/a.webp');
  });
});
