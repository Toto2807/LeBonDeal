import { describe, expect, it } from 'vitest';
import { centsToEuros, eurosToCents } from './money.js';

describe('eurosToCents', () => {
  it('accepte la virgule et le point', () => {
    expect(eurosToCents('12,50')).toBe(1250);
    expect(eurosToCents('12.5')).toBe(1250);
    expect(eurosToCents('0,05')).toBe(5);
  });

  it('ignore les espaces, y compris insécables', () => {
    expect(eurosToCents(' 1 200 ')).toBe(120000);
    expect(eurosToCents('1 200')).toBe(120000);
    expect(eurosToCents('1 200,5')).toBe(120050);
  });

  it('ne fait aucune erreur d\'arrondi', () => {
    expect(eurosToCents('19,99')).toBe(1999);
    expect(eurosToCents('0,29')).toBe(29);
    expect(eurosToCents('1.15')).toBe(115);
  });

  it('accepte un nombre', () => {
    expect(eurosToCents(12)).toBe(1200);
    expect(eurosToCents(0)).toBe(0);
  });

  it('refuse le vide, le négatif, le non numérique et plus de 2 décimales', () => {
    for (const bad of ['', '   ', null, undefined, '-5', 'abc', '12,999', '12,', ',50', '1,2,3', '1e3']) {
      expect(eurosToCents(bad), `entrée ${JSON.stringify(bad)}`).toBeNull();
    }
  });
});

describe('centsToEuros', () => {
  it('affiche sans décimales quand le montant est rond', () => {
    expect(centsToEuros(15000)).toBe('150');
    expect(centsToEuros(0)).toBe('0');
  });

  it('affiche deux décimales avec une virgule sinon', () => {
    expect(centsToEuros(1250)).toBe('12,50');
    expect(centsToEuros(5)).toBe('0,05');
    expect(centsToEuros(120001)).toBe('1200,01');
  });

  it('est l\'inverse de eurosToCents', () => {
    for (const cents of [0, 5, 99, 100, 1250, 1999, 850000]) {
      expect(eurosToCents(centsToEuros(cents))).toBe(cents);
    }
  });
});
