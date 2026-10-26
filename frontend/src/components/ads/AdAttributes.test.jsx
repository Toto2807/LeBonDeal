import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AdAttributes from './AdAttributes.jsx';
import { adDetail, carSchema } from '../../test/fixtures.js';

const rowFor = (label) => screen.getByText(label).closest('div');

describe('AdAttributes', () => {
  it('affiche libellé, valeur et unité issus de la définition de la catégorie', () => {
    render(<AdAttributes attributes={adDetail().attributes} fields={carSchema.fields} />);
    expect(within(rowFor('Kilométrage')).getByText(/^80\s000\s?km$/)).toBeInTheDocument();
    expect(within(rowFor('Marque')).getByText('Peugeot')).toBeInTheDocument();
    expect(within(rowFor('Année')).getByText('2019')).toBeInTheDocument();
    expect(within(rowFor('Carburant')).getByText('Diesel')).toBeInTheDocument();
  });

  it('respecte l\'ordre des champs de la définition', () => {
    render(<AdAttributes attributes={adDetail().attributes} fields={carSchema.fields} />);
    const labels = screen.getAllByRole('term').map((term) => term.textContent);
    expect(labels).toEqual(['Marque', 'Modèle', 'Année', 'Kilométrage', 'Carburant']);
  });

  it('affiche Oui / Non pour un champ booléen', () => {
    const fields = [{ key: 'meuble', label: 'Meublé', type: 'boolean' }, { key: 'balcon', label: 'Balcon', type: 'boolean' }];
    render(<AdAttributes attributes={{ meuble: true, balcon: false }} fields={fields} />);
    expect(within(rowFor('Meublé')).getByText('Oui')).toBeInTheDocument();
    expect(within(rowFor('Balcon')).getByText('Non')).toBeInTheDocument();
  });

  it('affiche tel quel un attribut dont le champ n\'existe plus dans la définition', () => {
    render(<AdAttributes attributes={{ ...adDetail().attributes, couleur: 'Rouge' }} fields={carSchema.fields} />);
    expect(within(rowFor('couleur')).getByText('Rouge')).toBeInTheDocument();
  });

  it('ignore les champs sans valeur', () => {
    render(<AdAttributes attributes={{ marque: 'Peugeot' }} fields={carSchema.fields} />);
    expect(screen.getAllByRole('term')).toHaveLength(1);
  });

  it('n\'affiche rien sans caractéristique, et fonctionne sans définition (chargement ou échec)', () => {
    const { container, rerender } = render(<AdAttributes attributes={{}} fields={carSchema.fields} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<AdAttributes attributes={{ marque: 'Peugeot' }} fields={undefined} />);
    expect(within(rowFor('marque')).getByText('Peugeot')).toBeInTheDocument();
  });
});
