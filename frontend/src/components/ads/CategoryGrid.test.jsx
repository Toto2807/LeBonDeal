import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CategoryGrid from './CategoryGrid.jsx';
import { categoryIcon } from '../../lib/categoryIcons.js';
import { categories } from '../../test/fixtures.js';

describe('CategoryGrid', () => {
  it('propose un lien de recherche par catégorie racine', () => {
    render(<MemoryRouter><CategoryGrid categories={categories} /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'Véhicules' })).toHaveAttribute('href', '/recherche?category=vehicules');
    expect(screen.getByRole('link', { name: 'Maison & Jardin' })).toHaveAttribute('href', '/recherche?category=maison');
  });

  it('n\'affiche rien sans catégorie', () => {
    const { container } = render(<MemoryRouter><CategoryGrid categories={[]} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('categoryIcon', () => {
  it('connaît les icônes des catégories de départ et ne plante pas sur une icône inconnue', () => {
    for (const name of ['car', 'house', 'smartphone', 'sofa', 'shirt', 'gamepad-2', 'inconnue', undefined, null]) {
      expect(categoryIcon(name), `icône ${name}`).toBeTruthy();
    }
    expect(categoryIcon('car')).not.toBe(categoryIcon('house'));
    expect(categoryIcon('inconnue')).toBe(categoryIcon(undefined));
  });
});
