import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchCommunes } from './geo.js';

const stubFetch = (body, { ok = true, status = 200 } = {}) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};
const lyon = { nom: 'Lyon', codesPostaux: ['69001', '69002', '69003'], centre: { type: 'Point', coordinates: [4.8351, 45.758] } };

afterEach(() => vi.unstubAllGlobals());

describe('searchCommunes', () => {
  it('convertit [longitude, latitude] (ordre GeoJSON) en { lat, lng }', async () => {
    stubFetch([lyon]);
    const [place] = await searchCommunes('Lyon');
    expect(place).toEqual({ city: 'Lyon', postalCodes: ['69001', '69002', '69003'], lat: 45.758, lng: 4.8351 });
  });

  it('interroge geo.api.gouv.fr avec les bons paramètres et transmet le signal d\'annulation', async () => {
    const fetchMock = stubFetch([lyon]);
    const controller = new AbortController();
    await searchCommunes('  Lyo ', controller.signal);

    const [url, options] = fetchMock.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://geo.api.gouv.fr/communes');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ nom: 'Lyo', fields: 'nom,codesPostaux,centre', boost: 'population', limit: '5' });
    expect(options.signal).toBe(controller.signal);
  });

  it('ne fait aucun appel pour moins de 2 caractères', async () => {
    const fetchMock = stubFetch([lyon]);
    expect(await searchCommunes('L')).toEqual([]);
    expect(await searchCommunes('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignore une commune sans coordonnées et tolère l\'absence de code postal', async () => {
    stubFetch([{ nom: 'Sansgps', codesPostaux: ['00000'] }, { nom: 'Sanscode', centre: { coordinates: [1, 2] } }]);
    expect(await searchCommunes('Sans')).toEqual([{ city: 'Sanscode', postalCodes: [], lat: 2, lng: 1 }]);
  });

  it('échoue clairement quand le service répond une erreur', async () => {
    stubFetch({}, { ok: false, status: 503 });
    await expect(searchCommunes('Lyon')).rejects.toThrow('503');
  });
});
