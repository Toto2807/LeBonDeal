import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { ApiError, api } from '../../api/client.js';

// Photos déjà en ligne d'une annonce, en modification. Contrairement aux nouvelles photos (envoyées à l'enregistrement),
// retirer ou réordonner une photo existante agit tout de suite sur le serveur. images : [{ id, url, thumbUrl }] dans l'ordre.
export default function ExistingImages({ adId, images }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);

  const change = useMutation({
    mutationFn: ({ path, options }) => api(path, options),
    onMutate: () => setError(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ad', adId] }), // la liste affichée vient de cette requête
    onError: (failure) =>
      setError(failure instanceof ApiError ? failure.message : 'Impossible de modifier les photos. Vérifiez votre connexion et réessayez.'),
  });

  if (images.length === 0) return null;
  const ids = images.map((image) => image.id);

  function move(index, offset) {
    const reordered = [...ids];
    [reordered[index], reordered[index + offset]] = [reordered[index + offset], reordered[index]];
    change.mutate({ path: `/ads/${adId}/images/order`, options: { method: 'PATCH', body: { ids: reordered } } });
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((image, index) => (
          <li key={image.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <img src={image.thumbUrl} alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="flex items-center justify-between gap-1 p-2">
              <span className="truncate text-sm">{index === 0 ? 'Couverture' : `Photo ${index + 1}`}</span>
              <span className="flex shrink-0">
                <button type="button" disabled={change.isPending || index === 0} onClick={() => move(index, -1)} aria-label={`Monter la photo existante ${index + 1}`} className="grid size-9 place-items-center rounded-lg hover:bg-gray-100 disabled:opacity-30">
                  <ArrowUp size={18} aria-hidden="true" />
                </button>
                <button type="button" disabled={change.isPending || index === images.length - 1} onClick={() => move(index, 1)} aria-label={`Descendre la photo existante ${index + 1}`} className="grid size-9 place-items-center rounded-lg hover:bg-gray-100 disabled:opacity-30">
                  <ArrowDown size={18} aria-hidden="true" />
                </button>
                <button type="button" disabled={change.isPending} onClick={() => change.mutate({ path: `/ads/${adId}/images/${image.id}`, options: { method: 'DELETE' } })} aria-label={`Retirer la photo existante ${index + 1}`} className="grid size-9 place-items-center rounded-lg text-red-700 hover:bg-red-50 disabled:opacity-30">
                  <X size={18} aria-hidden="true" />
                </button>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
