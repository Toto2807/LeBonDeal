import { describe, expect, it } from 'vitest';
import { formatAttributeValue } from './attributes.js';

describe('formatAttributeValue', () => {
  it('sépare les milliers et ajoute l\'unité d\'une quantité', () => {
    expect(formatAttributeValue(80000, { unit: 'km' }).replace(/\s/g, ' ')).toBe('80 000 km');
    expect(formatAttributeValue(120, { unit: 'Go' })).toBe('120 Go');
  });

  it('laisse une année ou un nombre sans unité tel quel', () => {
    expect(formatAttributeValue(2019, { key: 'annee' })).toBe('2019');
    expect(formatAttributeValue(2019)).toBe('2019');
  });

  it('écrit un booléen en toutes lettres', () => {
    expect(formatAttributeValue(true)).toBe('Oui');
    expect(formatAttributeValue(false)).toBe('Non');
  });

  it('renvoie un texte inchangé', () => {
    expect(formatAttributeValue('Diesel')).toBe('Diesel');
  });
});
