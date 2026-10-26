import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComingSoon from './ComingSoon.jsx';

describe('ComingSoon', () => {
  it('affiche le titre de la page et la phase de la feuille de route', () => {
    render(<ComingSoon title="Messagerie" phase={2} />);
    expect(screen.getByRole('heading', { name: 'Messagerie' })).toBeInTheDocument();
    expect(screen.getByText('Page à construire en phase 2.')).toBeInTheDocument();
  });
});
