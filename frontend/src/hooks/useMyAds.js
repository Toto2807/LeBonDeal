import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

export const MY_ADS_PAGE_SIZE = 20;

// Mes annonces (hors supprimées). status : undefined = toutes, sinon draft|active|reserved|sold|archived.
// Réponse : { data: [{ id, title, priceCents, status, city, coverUrl, publishedAt }], meta: { total, page, limit } }
export function useMyAds({ status, page }) {
  return useQuery({
    queryKey: ['my-ads', status ?? 'all', page],
    queryFn: ({ signal }) => api('/users/me/ads', { params: { status, page, limit: MY_ADS_PAGE_SIZE }, signal }),
    placeholderData: keepPreviousData,
  });
}
