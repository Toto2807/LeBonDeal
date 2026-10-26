import { useState } from 'react';

// images : [{ id, url, thumbUrl }] dans l'ordre d'affichage. Photo principale + miniatures (boutons, donc accessibles au clavier).
export default function Gallery({ images, title }) {
  const [selected, setSelected] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-gray-100 text-gray-500">Pas de photo</div>
    );
  }
  const index = Math.min(selected, images.length - 1); // la liste peut raccourcir (photo supprimée)

  return (
    <div>
      <div className="aspect-[4/3] overflow-hidden rounded-xl bg-gray-100">
        <img
          src={images[index].url}
          alt={`${title} — photo ${index + 1} sur ${images.length}`}
          className="h-full w-full object-contain"
        />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, position) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setSelected(position)}
                aria-label={`Voir la photo ${position + 1} sur ${images.length}`}
                aria-pressed={position === index}
                className={`block size-16 overflow-hidden rounded-lg border-2 ${position === index ? 'border-brand-700' : 'border-transparent'}`}
              >
                <img src={image.thumbUrl} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
