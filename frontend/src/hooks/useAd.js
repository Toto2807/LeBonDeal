import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

// Fiche complète d'une annonce (AdDetail, voir docs/lebondeal/05-backend.md). Un jeton valide est envoyé automatiquement :
// le propriétaire voit ainsi ses brouillons et annonces archivées, les autres reçoivent un 404.
// Sans identifiant (formulaire de dépôt), aucune requête n'est faite.
export function useAd(id) {
  return useQuery({
    queryKey: ['ad', id],
    queryFn: async ({ signal }) => (await api(`/ads/${id}`, { signal })).data,
    enabled: Boolean(id),
  });
}
