import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePageTitle } from './usePageTitle.js';

describe('usePageTitle', () => {
  it('fixe le titre de l\'onglet puis le restaure au démontage', () => {
    document.title = 'LeBonDeal';
    const { rerender, unmount } = renderHook(({ title }) => usePageTitle(title), { initialProps: { title: 'Connexion' } });
    expect(document.title).toBe('Connexion · LeBonDeal');

    rerender({ title: 'Inscription' });
    expect(document.title).toBe('Inscription · LeBonDeal');

    unmount();
    expect(document.title).toBe('LeBonDeal');
  });
});
