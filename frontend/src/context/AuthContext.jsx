import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, api, setAccessToken, setUnauthorizedHandler } from '../api/client.js';

const AuthContext = createContext(null);
const TOKEN_KEY = 'lbd_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true tant qu'on ne sait pas si le visiteur est connecté

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  // Session expirée : toute requête qui reçoit « jeton invalide » déconnecte l'utilisateur (déclaré AVANT le chargement initial).
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
      toast.info('Votre session a expiré, reconnectez-vous.');
    });
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Au chargement de la page : si un jeton est mémorisé, on demande à l'API qui est connecté.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    setAccessToken(token);
    api('/auth/me')
      .then(({ data }) => setUser(data))
      .catch((error) => {
        // Seul un refus du serveur (401) efface le jeton : une panne réseau ne doit pas déconnecter l'utilisateur.
        if (error instanceof ApiError && error.status === 401) logout();
      })
      .finally(() => setLoading(false));
  }, [logout]);

  const login = useCallback(async (credentials) => {
    const { data } = await api('/auth/login', { method: 'POST', body: credentials });
    localStorage.setItem(TOKEN_KEY, data.token);
    setAccessToken(data.token);
    setUser(data.user);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  return useContext(AuthContext);
}
