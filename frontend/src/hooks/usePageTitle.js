import { useEffect } from 'react';

// Titre de l'onglet : « Connexion · LeBonDeal ». Restauré quand la page est quittée.
export function usePageTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · LeBonDeal`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
