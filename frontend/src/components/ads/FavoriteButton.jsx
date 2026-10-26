import { Heart } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';

const KEY = ['favorite-ids'];

// Identifiants des annonces favorites : chargés une seule fois, partagés par toutes les cartes de la page.
function useFavoriteIds() {
  const { user } = useAuth();
  return useQuery({ queryKey: KEY, queryFn: async () => (await api('/favorites/ids')).data, enabled: Boolean(user) });
}

export default function FavoriteButton({ adId, className = '' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: favoriteIds = [] } = useFavoriteIds();
  const isFavorite = favoriteIds.includes(adId);

  const toggle = useMutation({
    mutationFn: () => api(`/favorites/${adId}`, { method: isFavorite ? 'DELETE' : 'PUT' }),
    // Mise à jour optimiste : le cœur change tout de suite, sans attendre la réponse du serveur…
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const previous = queryClient.getQueryData(KEY) ?? []; // la liste peut ne pas être encore arrivée
      queryClient.setQueryData(KEY, isFavorite ? previous.filter((id) => id !== adId) : [...previous, adId]);
      return { previous };
    },
    // …et revient en arrière si le serveur refuse.
    onError: (_error, _variables, context) => queryClient.setQueryData(KEY, context.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });

  function onClick() {
    if (!user) return navigate('/connexion'); // visiteur non connecté
    toggle.mutate();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      className={`grid size-11 place-items-center rounded-full bg-white/90 shadow ${className}`}
    >
      <Heart size={20} className={isFavorite ? 'fill-brand-600 text-brand-600' : 'text-gray-600'} />
    </button>
  );
}
