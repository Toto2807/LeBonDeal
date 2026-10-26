import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDraft } from './useDraft.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('useDraft', () => {
  it('enregistre puis relit un brouillon', () => {
    const { result } = renderHook(() => useDraft('brouillon-test'));
    expect(result.current.load()).toBeNull();
    result.current.save({ title: 'Vélo', price: '120' });
    expect(result.current.load()).toEqual({ title: 'Vélo', price: '120' });
  });

  it('efface le brouillon', () => {
    const { result } = renderHook(() => useDraft('brouillon-test'));
    result.current.save({ title: 'Vélo' });
    result.current.clear();
    expect(result.current.load()).toBeNull();
    expect(localStorage.getItem('brouillon-test')).toBeNull();
  });

  it('garde un brouillon par clé (un par utilisateur)', () => {
    const marie = renderHook(() => useDraft('brouillon:marie')).result.current;
    const paul = renderHook(() => useDraft('brouillon:paul')).result.current;
    marie.save({ title: 'De Marie' });
    expect(paul.load()).toBeNull();
  });

  it('ignore un contenu corrompu au lieu de planter', () => {
    localStorage.setItem('brouillon-test', '{pas du json');
    const { result } = renderHook(() => useDraft('brouillon-test'));
    expect(result.current.load()).toBeNull();
  });

  it('ne plante pas quand le stockage est indisponible ou plein', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('plein', 'QuotaExceededError'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('bloqué', 'SecurityError'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new DOMException('bloqué', 'SecurityError'); });
    const { result } = renderHook(() => useDraft('brouillon-test'));
    expect(() => result.current.save({ title: 'x' })).not.toThrow();
    expect(result.current.load()).toBeNull();
    expect(() => result.current.clear()).not.toThrow();
  });
});
