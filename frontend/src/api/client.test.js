import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, setAccessToken, setUnauthorizedHandler } from './client.js';

const respond = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const stubFetch = (...responses) => {
  const fetchMock = vi.fn();
  for (const response of responses) fetchMock.mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
  setUnauthorizedHandler(null);
});

describe('api()', () => {
  it('renvoie le contenu JSON, ignore les paramètres vides et envoie le jeton', async () => {
    const fetchMock = stubFetch(respond(200, { data: [1, 2], meta: { total: 2 } }));
    setAccessToken('jeton-1');

    const result = await api('/ads', { params: { q: 'velo', page: 2, category: '', priceMax: null } });

    expect(result).toEqual({ data: [1, 2], meta: { total: 2 } });
    const [url, options] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe('/api/ads');
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ q: 'velo', page: '2' });
    expect(options.headers.Authorization).toBe('Bearer jeton-1');
  });

  it('renvoie null pour une réponse 204', async () => {
    stubFetch(respond(204));
    expect(await api('/favorites/abc', { method: 'PUT' })).toBeNull();
  });

  it('transforme une erreur du serveur en ApiError avec code et détails', async () => {
    stubFetch(respond(400, { error: { code: 'VALIDATION', message: 'Données invalides', details: [{ path: 'title', message: 'trop court' }] } }));
    const error = await api('/ads', { method: 'POST', body: {} }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('VALIDATION');
    expect(error.message).toBe('Données invalides');
    expect(error.details).toEqual([{ path: 'title', message: 'trop court' }]);
  });
});

describe('session expirée', () => {
  it('prévient le gestionnaire quand le jeton envoyé est refusé (TOKEN_INVALID)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setAccessToken('jeton-expire');
    stubFetch(respond(401, { error: { code: 'TOKEN_INVALID', message: 'Session expirée ou invalide' } }));

    await expect(api('/auth/me')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ne déconnecte pas pour un mauvais mot de passe (INVALID_CREDENTIALS)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    setAccessToken('jeton-valide');
    stubFetch(respond(401, { error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou mot de passe incorrect' } }));

    await expect(api('/auth/login', { method: 'POST', body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('ne fait rien pour un visiteur sans jeton', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    stubFetch(respond(401, { error: { code: 'TOKEN_MISSING', message: 'Authentification requise' } }));

    await expect(api('/favorites/ids')).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });
});
