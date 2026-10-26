import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

// Arbre des catégories : [{ id, slug, name, icon, children: [{ id, slug, name }] }]. Change presque jamais : on le garde en mémoire.
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api('/categories')).data,
    staleTime: Infinity,
  });
}

// Définition des champs dynamiques d'une catégorie (MongoDB, collection category_schemas) :
// { categorySlug, fields: [{ key, label, type, required, filterable, options, unit, min, max }] }
export function useCategorySchema(slug) {
  return useQuery({
    queryKey: ['category-schema', slug],
    queryFn: async () => (await api(`/categories/${slug}/schema`)).data,
    enabled: Boolean(slug),
    staleTime: Infinity,
  });
}
