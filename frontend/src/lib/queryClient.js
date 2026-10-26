import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client.js';

// Une requête refusée par le serveur (400, 401, 404…) donnera la même réponse la seconde fois : on ne la relance pas.
// Une panne réseau ou une erreur 5xx est relancée une fois.
export function shouldRetry(failureCount, error) {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false } } });
