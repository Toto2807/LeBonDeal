import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import MyAds from './MyAds.jsx';
import { ApiError, api } from '../../api/client.js';
import { adCard } from '../../test/fixtures.js';
import { renderApp } from '../../test/render.jsx';

vi.mock('../../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));

const ads = [
  adCard(1, { title: 'Vélo en ligne', status: 'active' }),
  adCard(2, { title: 'Table réservée', status: 'reserved' }),
  adCard(3, { title: 'Canapé vendu', status: 'sold' }),
  adCard(4, { title: 'Lampe archivée', status: 'archived' }),
];
const page = (data = ads, meta = { total: data.length, page: 1, limit: 20 }) => ({ data, meta });
const listCalls = () => api.mock.calls.filter(([path]) => path === '/users/me/ads');
const writeCalls = () => api.mock.calls.filter(([path]) => path !== '/users/me/ads');
const card = (title) => screen.getByRole('link', { name: title }).closest('li');
const button = (title, name) => within(card(title)).getByRole('button', { name });

const serve = (response = page()) => api.mockImplementation(async (path) => {
  if (path === '/users/me/ads') return typeof response === 'function' ? response() : response;
  return { data: {} };
});
const renderPage = (url = '/compte') =>
  renderApp(<Routes><Route path="/compte" element={<MyAds />} /></Routes>, { entries: [url] });

beforeEach(() => {
  api.mockReset();
  serve();
});

describe('Mes annonces : liste', () => {
  it('affiche chaque annonce avec son statut en toutes lettres', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Vélo en ligne' })).toHaveAttribute('href', `/annonces/${ads[0].id}`);
    expect(within(card('Vélo en ligne')).getByText('En ligne')).toBeInTheDocument();
    expect(within(card('Table réservée')).getByText('Réservée')).toBeInTheDocument();
    expect(within(card('Canapé vendu')).getByText('Vendue')).toBeInTheDocument();
    expect(within(card('Lampe archivée')).getByText('Archivée')).toBeInTheDocument();
  });

  it('montre des emplacements pendant le chargement', () => {
    api.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement');
  });

  it('affiche une erreur avec « Réessayer » quand l\'API échoue', async () => {
    serve(() => { throw new Error('réseau coupé'); });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger vos annonces');
    serve();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('link', { name: 'Vélo en ligne' })).toBeInTheDocument();
  });

  it('invite à déposer une première annonce quand il n\'y en a aucune', async () => {
    serve(page([]));
    renderPage();
    expect(await screen.findByText(/pas encore d'annonce/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Déposer une annonce' })).toHaveAttribute('href', '/deposer');
  });

  it('pagine : « Suivant » demande la page 2', async () => {
    serve(page(ads, { total: 45, page: 1, limit: 20 }));
    renderPage();
    expect(await screen.findByText('Page 1 sur 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    await waitFor(() => expect(listCalls().at(-1)[1].params).toMatchObject({ page: 2 }));
  });
});

describe('Mes annonces : onglets par statut', () => {
  it('propose les cinq onglets, « Toutes » étant courant au départ', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Vélo en ligne' });
    for (const name of ['Toutes', 'Actives', 'Réservées', 'Vendues', 'Archivées']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: 'Toutes' })).toHaveAttribute('aria-pressed', 'true');
    expect(listCalls()[0][1].params.status).toBeUndefined();
  });

  it('filtre par statut côté serveur et revient à la page 1', async () => {
    serve(page(ads, { total: 45, page: 1, limit: 20 }));
    renderPage('/compte?page=2');
    await screen.findByText('Page 2 sur 3');
    await userEvent.click(screen.getByRole('button', { name: 'Vendues' }));
    await waitFor(() => expect(listCalls().at(-1)[1].params).toMatchObject({ status: 'sold', page: 1 }));
    expect(screen.getByRole('button', { name: 'Vendues' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('adapte le message du « vide » au filtre choisi', async () => {
    serve(page([]));
    renderPage('/compte?statut=sold');
    expect(await screen.findByText('Aucune annonce vendue.')).toBeInTheDocument();
  });
});

describe('Mes annonces : actions selon le statut', () => {
  const names = (title) => within(card(title)).queryAllByRole('button').map((b) => b.textContent);
  const links = (title) => within(card(title)).queryAllByRole('link').map((a) => a.textContent);

  it('annonce en ligne : modifier, réserver, vendre, archiver, supprimer', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Vélo en ligne' });
    expect(links('Vélo en ligne')).toContain('Modifier');
    expect(names('Vélo en ligne')).toEqual(['Marquer comme réservée', 'Marquer comme vendue', 'Archiver', 'Supprimer']);
  });

  it('annonce réservée : remettre en vente, vendre, archiver, supprimer', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Table réservée' });
    expect(names('Table réservée')).toEqual(['Remettre en vente', 'Marquer comme vendue', 'Archiver', 'Supprimer']);
  });

  it('annonce vendue : ni modification ni changement de statut, seulement supprimer', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Canapé vendu' });
    expect(links('Canapé vendu')).not.toContain('Modifier');
    expect(names('Canapé vendu')).toEqual(['Supprimer']);
  });

  it('annonce archivée : republier, supprimer, et modification possible', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Lampe archivée' });
    expect(names('Lampe archivée')).toEqual(['Republier', 'Supprimer']);
    expect(links('Lampe archivée')).toContain('Modifier');
  });

  it('le lien « Modifier » mène au formulaire de modification', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Vélo en ligne' });
    expect(within(card('Vélo en ligne')).getByRole('link', { name: 'Modifier' })).toHaveAttribute('href', `/annonces/${ads[0].id}/modifier`);
  });
});

describe('Mes annonces : changements de statut', () => {
  it.each([
    ['Vélo en ligne', 'Marquer comme réservée', 'reserved'],
    ['Vélo en ligne', 'Archiver', 'archived'],
    ['Table réservée', 'Remettre en vente', 'active'],
    ['Lampe archivée', 'Republier', 'active'],
  ])('« %s » : « %s » envoie le statut « %s » sans confirmation', async (title, action, status) => {
    renderPage();
    await screen.findByRole('link', { name: title });
    await userEvent.click(button(title, action));
    const id = ads.find((ad) => ad.title === title).id;
    expect(api).toHaveBeenCalledWith(`/ads/${id}/status`, { method: 'PATCH', body: { status } });
  });

  it('recharge la liste après un changement', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Vélo en ligne' });
    const before = listCalls().length;
    await userEvent.click(button('Vélo en ligne', 'Archiver'));
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
  });

  it('demande confirmation avant de marquer une annonce comme vendue', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Vélo en ligne' });
    await userEvent.click(button('Vélo en ligne', 'Marquer comme vendue'));

    expect(screen.getByRole('alertdialog', { name: 'Marquer comme vendue ?' })).toBeInTheDocument();
    expect(writeCalls()).toHaveLength(0);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Marquer comme vendue' }));
    expect(api).toHaveBeenCalledWith(`/ads/${ads[0].id}/status`, { method: 'PATCH', body: { status: 'sold' } });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('affiche le message du serveur quand le changement est refusé', async () => {
    api.mockImplementation(async (path) => {
      if (path === '/users/me/ads') return page();
      throw new ApiError(409, { error: { code: 'INVALID_TRANSITION', message: 'Une annonce « sold » ne peut pas passer à « active »' } });
    });
    renderPage();
    await screen.findByRole('link', { name: 'Vélo en ligne' });
    await userEvent.click(button('Vélo en ligne', 'Archiver'));
    expect(await screen.findByRole('alert')).toHaveTextContent('ne peut pas passer à');
  });
});

describe('Mes annonces : suppression', () => {
  it('ne supprime rien avant la confirmation, et rien du tout si on annule', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Vélo en ligne' });
    await userEvent.click(button('Vélo en ligne', 'Supprimer'));
    expect(screen.getByRole('alertdialog', { name: /supprimer l'annonce/i })).toBeInTheDocument();
    expect(writeCalls()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(writeCalls()).toHaveLength(0);
  });

  it('supprime après confirmation puis recharge la liste', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Vélo en ligne' });
    const before = listCalls().length;
    await userEvent.click(button('Vélo en ligne', 'Supprimer'));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));

    expect(api).toHaveBeenCalledWith(`/ads/${ads[0].id}`, { method: 'DELETE' });
    await waitFor(() => expect(listCalls().length).toBeGreaterThan(before));
  });

  it('nomme l\'annonce dans la confirmation', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Vélo en ligne' });
    await userEvent.click(button('Vélo en ligne', 'Supprimer'));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Vélo en ligne');
  });
});
