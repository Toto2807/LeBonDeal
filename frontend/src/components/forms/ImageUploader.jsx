import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { ACCEPTED_TYPES, addPhotos, movePhoto } from '../../lib/photos.js';

// files : File[] (l'ordre est l'ordre d'affichage de l'annonce ; la première photo est la couverture).
// Les règles (types, 8 Mo, maximum) sont celles du serveur : ici on répond tout de suite, le serveur contrôle à nouveau.
export default function ImageUploader({ files, onChange, max = 10 }) {
  const [errors, setErrors] = useState([]);

  // Aperçus : des URL temporaires, libérées quand la liste change ou que le composant disparaît (sinon fuite de mémoire).
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function add(incoming) {
    const result = addPhotos(files, [...incoming], max);
    setErrors(result.errors);
    if (result.files.length !== files.length) onChange(result.files);
  }

  return (
    <div className="space-y-4">
      <div
        data-testid="dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          add(event.dataTransfer.files);
        }}
      >
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 bg-white p-4 text-center focus-within:border-brand-700 hover:border-brand-500">
          <span className="font-medium">Glissez vos photos ici ou cliquez pour les choisir</span>
          <span className="text-sm text-gray-600">{max} photos maximum, 8 Mo chacune (JPEG, PNG ou WebP)</span>
          <input
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(',')}
            className="sr-only"
            onChange={(event) => {
              add(event.target.files);
              event.target.value = ''; // permet de rechoisir le même fichier après l'avoir retiré
            }}
          />
        </label>
      </div>

      {errors.length > 0 && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errors.map((message) => <p key={message}>{message}</p>)}
        </div>
      )}

      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <img src={previews[index]} alt="" className="aspect-[4/3] w-full object-cover" />
              <div className="flex items-center justify-between gap-1 p-2">
                <span className="truncate text-sm">{index === 0 ? 'Couverture' : `Photo ${index + 1}`}</span>
                <span className="flex shrink-0">
                  <button type="button" disabled={index === 0} onClick={() => onChange(movePhoto(files, index, -1))} aria-label={`Monter la photo ${index + 1}`} className="grid size-9 place-items-center rounded-lg hover:bg-gray-100 disabled:opacity-30">
                    <ArrowUp size={18} aria-hidden="true" />
                  </button>
                  <button type="button" disabled={index === files.length - 1} onClick={() => onChange(movePhoto(files, index, 1))} aria-label={`Descendre la photo ${index + 1}`} className="grid size-9 place-items-center rounded-lg hover:bg-gray-100 disabled:opacity-30">
                    <ArrowDown size={18} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => onChange(files.filter((_, position) => position !== index))} aria-label={`Retirer la photo ${index + 1} (${file.name})`} className="grid size-9 place-items-center rounded-lg text-red-700 hover:bg-red-50">
                    <X size={18} aria-hidden="true" />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
