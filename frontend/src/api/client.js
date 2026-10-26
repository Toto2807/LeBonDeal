// Client HTTP unique du frontend. Les composants n'appellent jamais fetch directement.
// Succès : { data, meta? }  —  Erreur : { error: { code, message, details? } } (voir middlewares/errorHandler.js)
let accessToken = null;
export const setAccessToken = (token) => { accessToken = token; };

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `Erreur ${status}`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details; // [{ path, message }] pour les erreurs de validation
  }
}

export async function api(path, { method = 'GET', body, params, signal } = {}) {
  const url = new URL(`/api${path}`, window.location.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null && value !== '') url.searchParams.set(key, value);
  }

  const isForm = body instanceof FormData; // envoi de photos : le navigateur fixe lui-même le Content-Type
  const response = await fetch(url, {
    method,
    signal,
    headers: {
      ...(body && !isForm && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}
