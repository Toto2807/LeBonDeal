import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client.js';
import { createQueryClient, shouldRetry } from './queryClient.js';

const apiError = (status) => new ApiError(status, { error: { code: 'X', message: 'x' } });

describe('shouldRetry', () => {
  it.each([400, 401, 403, 404, 409, 422])('ne relance jamais une requête refusée par une erreur %i', (status) => {
    expect(shouldRetry(0, apiError(status))).toBe(false);
  });

  it('relance une fois après une erreur du serveur ou une coupure réseau, pas deux', () => {
    expect(shouldRetry(0, apiError(500))).toBe(true);
    expect(shouldRetry(0, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(1, apiError(500))).toBe(false);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(false);
  });
});

describe('createQueryClient', () => {
  it('applique cette règle et ne recharge pas à chaque retour sur l\'onglet', () => {
    const { queries } = createQueryClient().getDefaultOptions();
    expect(queries.retry).toBe(shouldRetry);
    expect(queries.refetchOnWindowFocus).toBe(false);
    expect(queries.staleTime).toBe(30_000);
  });
});
