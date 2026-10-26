// Recherche de communes françaises : API publique et gratuite geo.api.gouv.fr (sans clé, appelable depuis le navigateur).
// Retourne [{ city, postalCodes, lat, lng }]. ⚠ L'API donne les coordonnées au format GeoJSON [longitude, latitude].
export async function searchCommunes(query, signal) {
  const text = query.trim();
  if (text.length < 2) return [];

  const url = new URL('https://geo.api.gouv.fr/communes');
  url.search = new URLSearchParams({ nom: text, fields: 'nom,codesPostaux,centre', boost: 'population', limit: '5' }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`geo.api.gouv.fr a répondu ${response.status}`);

  const communes = await response.json();
  return communes
    .filter((commune) => commune.centre?.coordinates)
    .map((commune) => ({
      city: commune.nom,
      postalCodes: commune.codesPostaux ?? [],
      lat: commune.centre.coordinates[1],
      lng: commune.centre.coordinates[0],
    }));
}
