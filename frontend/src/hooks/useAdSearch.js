import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

// Les filtres vivent dans l'URL (?q=velo&category=velos&priceMax=30000&attr.type=VTT&page=2) :
// la recherche est partageable, le bouton « Retour » fonctionne, et un rechargement de page ne perd rien.
export function useAdSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = Object.fromEntries(searchParams);

  const query = useQuery({
    queryKey: ['ads', filters],
    queryFn: ({ signal }) => api('/ads', { params: filters, signal }),
    placeholderData: keepPreviousData, // l'ancienne liste reste affichée pendant le chargement de la suivante
  });

  // setFilters({ priceMax: 30000 }) modifie ou ajoute ; une valeur vide supprime le filtre.
  function setFilters(patch) {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(patch)) {
        if (value == null || value === '') next.delete(key);
        else next.set(key, value);
      }
      if ('category' in patch) {
        for (const key of [...next.keys()]) if (key.startsWith('attr.')) next.delete(key); // filtres propres à l'ancienne catégorie
      }
      if (!('page' in patch)) next.delete('page'); // changer un filtre ramène à la page 1
      return next;
    });
  }

  return { filters, setFilters, ...query };
}
