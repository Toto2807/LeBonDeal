import { describe, expect, it } from 'vitest';
import { formatPrice, timeAgo } from './format.js';

describe('formatPrice', () => {
  it('affiche les euros entiers sans décimales', () => {
    expect(formatPrice(15000)).toMatch(/^150\s€$/);
  });

  it('affiche les centimes quand il y en a', () => {
    expect(formatPrice(1250)).toMatch(/^12,50\s€$/);
  });
});

describe('timeAgo', () => {
  it('formate en français', () => {
    expect(timeAgo(Date.now() - 3 * 3_600_000)).toBe('il y a 3 heures');
    expect(timeAgo(Date.now() - 86_400_000)).toBe('hier');
    expect(timeAgo(Date.now() - 5_000)).toBe("à l'instant");
  });
});
