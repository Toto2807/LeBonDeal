import { useEffect, useId, useState } from 'react';
import { searchCommunes } from '../../lib/geo.js';

const labelOf = (place) => `${place.city} (${place.postalCode})`;

// Une ligne par couple ville / code postal (Lyon en a neuf), huit propositions au maximum.
const toOptions = (communes) =>
  communes
    .flatMap((commune) => commune.postalCodes.map((postalCode) => ({
      key: `${commune.city}-${postalCode}`,
      place: { city: commune.city, postalCode, lat: commune.lat, lng: commune.lng },
    })))
    .slice(0, 8);

// value : { city, postalCode, lat, lng } ou null · onChange(place | null).
// La ville n'est « choisie » qu'en cliquant une proposition : dès que l'utilisateur retape, la valeur redevient null,
// pour que la ville et les coordonnées envoyées au serveur aillent toujours ensemble.
export default function CityPicker({ value, onChange, error, label = 'Ville' }) {
  const id = useId();
  const [text, setText] = useState(value ? labelOf(value) : '');
  const [search, setSearch] = useState(''); // ce que l'utilisateur a tapé (pas le texte rempli par une sélection)
  const [options, setOptions] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | loading | done | error

  // Valeur fournie de l'extérieur (brouillon restauré, annonce à modifier).
  useEffect(() => {
    if (value) setText(labelOf(value));
  }, [value]);

  // Recherche différée de 250 ms. Le nettoyage annule la recherche précédente : une réponse arrivée en retard
  // ne peut jamais écraser celle d'une frappe plus récente.
  useEffect(() => {
    if (search.trim().length < 2) {
      setOptions([]);
      setStatus('idle');
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const communes = await searchCommunes(search, controller.signal);
        if (controller.signal.aborted) return;
        setOptions(toOptions(communes));
        setStatus('done');
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  function onType(event) {
    setText(event.target.value);
    setSearch(event.target.value);
    if (value) onChange(null);
  }

  function choose(place) {
    setText(labelOf(place));
    setSearch('');
    setOptions([]);
    setStatus('idle');
    onChange(place);
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input
        id={id}
        type="text"
        value={text}
        onChange={onType}
        autoComplete="off"
        placeholder="Tapez le nom de la ville"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 aria-[invalid=true]:border-red-700"
      />
      {status === 'loading' && <p className="mt-1 text-sm text-gray-500">Recherche…</p>}
      {status === 'error' && (
        <p role="alert" className="mt-1 text-sm text-red-700">Impossible de charger les villes. Vérifiez votre connexion et réessayez.</p>
      )}
      {status === 'done' && options.length === 0 && <p className="mt-1 text-sm text-gray-500">Aucune ville ne correspond.</p>}
      {options.length > 0 && (
        <ul aria-label="Villes proposées" className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {options.map((option) => (
            <li key={option.key}>
              <button type="button" onClick={() => choose(option.place)} className="min-h-11 w-full px-3 py-2 text-left hover:bg-brand-100">
                {labelOf(option.place)}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
