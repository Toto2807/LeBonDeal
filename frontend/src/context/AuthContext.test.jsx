import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { api, setAccessToken } from '../api/client.js';

const respond = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
const marie = { id: 'u1', email: 'marie@test.fr', displayName: 'Marie', role: 'user' };

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('AuthProvider', () => {
  it('démarre sans utilisateur quand aucun jeton n\'est mémorisé', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retrouve l\'utilisateur d\'un jeton mémorisé', async () => {
    localStorage.setItem('lbd_token', 'jeton-memorise');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respond(200, { data: marie })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.user?.displayName).toBe('Marie'));
    expect(result.current.loading).toBe(false);
  });

  it('oublie un jeton que le serveur refuse', async () => {
    localStorage.setItem('lbd_token', 'jeton-perime');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respond(401, { error: { code: 'TOKEN_INVALID', message: 'Session expirée' } })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('lbd_token')).toBeNull();
  });

  it('garde le jeton quand le réseau est coupé au chargement (l\'utilisateur ne doit pas être déconnecté pour autant)', async () => {
    localStorage.setItem('lbd_token', 'jeton-valide');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('lbd_token')).toBe('jeton-valide');
  });

  it('login mémorise le jeton et l\'envoie ensuite ; logout efface tout', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(respond(200, { data: { token: 'jeton-1', user: marie } }))
      .mockResolvedValueOnce(respond(200, { data: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.login({ email: marie.email, password: 'motdepasse' }));
    expect(result.current.user.displayName).toBe('Marie');
    expect(localStorage.getItem('lbd_token')).toBe('jeton-1');

    await api('/ads');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer jeton-1');

    act(() => result.current.logout());
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('lbd_token')).toBeNull();
  });

  it('déconnecte l\'utilisateur quand une requête reçoit TOKEN_INVALID', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(respond(200, { data: { token: 'jeton-1', user: marie } }))
      .mockResolvedValueOnce(respond(401, { error: { code: 'TOKEN_INVALID', message: 'Session expirée ou invalide' } })));
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(() => result.current.login({ email: marie.email, password: 'motdepasse' }));
    expect(result.current.user).not.toBeNull();

    await act(() => api('/favorites/ids').catch(() => {}));
    expect(result.current.user).toBeNull();
    expect(localStorage.getItem('lbd_token')).toBeNull();
  });
});
