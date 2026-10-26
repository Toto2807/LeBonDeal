import { useMemo } from 'react';

// Brouillon enregistré dans le navigateur (localStorage) : un confort par appareil, jamais une source de vérité.
// Un stockage plein, bloqué ou corrompu ne doit jamais empêcher de déposer une annonce : toutes les erreurs sont absorbées.
export function useDraft(key) {
  return useMemo(
    () => ({
      load() {
        try {
          const raw = localStorage.getItem(key);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      },
      save(values) {
        try {
          localStorage.setItem(key, JSON.stringify(values));
        } catch {
          // stockage plein ou indisponible : tant pis pour le brouillon
        }
      },
      clear() {
        try {
          localStorage.removeItem(key);
        } catch {
          // idem
        }
      },
    }),
    [key]
  );
}
