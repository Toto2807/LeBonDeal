import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import PriceHint from './PriceHint.jsx';
import SellerCard from './SellerCard.jsx';
import { adDetail } from '../../test/fixtures.js';

const renderSeller = (seller) => render(<MemoryRouter><SellerCard seller={seller} /></MemoryRouter>);

describe('SellerCard', () => {
  it('affiche le vendeur, son ancienneté et ses annonces', () => {
    renderSeller(adDetail().seller);
    expect(screen.getByRole('link', { name: 'Marie' })).toHaveAttribute('href', '/vendeur/22222222-2222-4222-8222-222222222222');
    expect(screen.getByText(/membre depuis mars 2025/i)).toBeInTheDocument();
    expect(screen.getByText('3 annonces en ligne')).toBeInTheDocument();
  });

  it('indique « Pas encore d\'avis » sans note, jamais « 0 / 5 »', () => {
    renderSeller(adDetail().seller);
    expect(screen.getByText("Pas encore d'avis")).toBeInTheDocument();
    expect(screen.queryByText(/\/ 5/)).not.toBeInTheDocument();
  });

  it('affiche la note moyenne et le nombre d\'avis, au singulier comme au pluriel', () => {
    const { rerender } = renderSeller({ ...adDetail().seller, ratingAvg: 4.8, ratingCount: 12 });
    expect(screen.getByText('4,8 / 5')).toBeInTheDocument();
    expect(screen.getByText('(12 avis)')).toBeInTheDocument();

    rerender(<MemoryRouter><SellerCard seller={{ ...adDetail().seller, ratingAvg: 5, ratingCount: 1, activeAdsCount: 1 }} /></MemoryRouter>);
    expect(screen.getByText('(1 avis)')).toBeInTheDocument();
    expect(screen.getByText('1 annonce en ligne')).toBeInTheDocument();
  });
});

describe('PriceHint', () => {
  it.each([
    ['good_deal', 'Bon prix'],
    ['fair', 'Prix du marché'],
    ['high', 'Au-dessus du marché'],
  ])('affiche « %s » comme « %s »', (hint, text) => {
    render(<PriceHint hint={hint} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('n\'affiche rien quand il n\'y a pas assez d\'annonces comparables', () => {
    const { container } = render(<PriceHint hint="unknown" />);
    expect(container).toBeEmptyDOMElement();
  });
});
