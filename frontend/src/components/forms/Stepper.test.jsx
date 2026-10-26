import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Stepper from './Stepper.jsx';

const steps = ['Catégorie', 'Détails', 'Photos', 'Prix et lieu', 'Récapitulatif'];

describe('Stepper', () => {
  it('liste les étapes dans l\'ordre, numérotées', () => {
    render(<Stepper steps={steps} current={0} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent('1Catégorie');
    expect(items[4]).toHaveTextContent('5Récapitulatif');
  });

  it('signale l\'étape courante aux lecteurs d\'écran', () => {
    render(<Stepper steps={steps} current={2} />);
    const items = screen.getAllByRole('listitem');
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items.filter((item) => item.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('distingue les étapes terminées par un texte, pas seulement par la couleur', () => {
    render(<Stepper steps={steps} current={2} />);
    expect(screen.getAllByText('(terminée)')).toHaveLength(2);
  });
});
