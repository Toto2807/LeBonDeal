import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';

// Affiche un composant avec ce dont les pages ont besoin : un routeur en mémoire et un cache de requêtes vierge
// (sans nouvelle tentative, pour qu'une erreur simulée apparaisse tout de suite).
// `strict: true` reproduit le mode de développement réel (StrictMode exécute chaque effet deux fois).
export function renderApp(ui, { entries = ['/'], strict = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={entries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}
