import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router';
import AdDetail from './AdDetail.jsx';
import { ApiError, api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { adDetail, carSchema } from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

const ad = adDetail();
const notFound = () => new ApiError(404, { error: { code: 'AD_NOT_FOUND', message: 'Annonce introuvable' } });

const serve = (detail = ad) =>
  api.mockImplementation(async (path) => {
    if (path === `/ads/${ad.id}`) {
      if (detail instanceof Error) throw detail;
      return { data: detail };
    }
    if (path === '/categories/voitures/schema') return { data: carSchema };
    throw new Error(`appel inattendu : ${path}`);
  });
const renderPage = () =>
  renderApp(<Routes><Route path="/annonces/:id" element={<AdDetail />} /></Routes>, { entries: [`/annonces/${ad.id}`] });
const visitor = () => useAuth.mockReturnValue({ user: null });
const connected = (id = 'autre-utilisateur') => useAuth.mockReturnValue({ user: { id, displayName: 'Paul' } });

beforeEach(() => {
  api.mockReset();
  useAuth.mockReset();
  visitor();
  serve();
});

describe('fiche annonce', () => {
  it('annonce le chargement aux lecteurs d\'écran', () => {
    api.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toHaveTextContent("Chargement de l'annonce");
  });

  it('affiche le titre, le prix, la description, le lieu et le fil d\'Ariane', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Peugeot 208 en excellent état' })).toBeInTheDocument();
    expect(screen.getByText(/^8\s500\s€$/)).toBeInTheDocument();
    expect(screen.getByText('Très bon état, entretien suivi, contrôle technique valide.')).toBeInTheDocument();
    expect(screen.getByText(/Lyon \(69003\)/)).toBeInTheDocument();
    expect(screen.getByText('Bon état')).toBeInTheDocument();
    expect(screen.getByText(/il y a 3 heures/)).toBeInTheDocument();

    const breadcrumb = screen.getByRole('navigation', { name: "Fil d'Ariane" });
    expect(within(breadcrumb).getByRole('link', { name: 'Véhicules' })).toHaveAttribute('href', '/recherche?category=vehicules');
    expect(within(breadcrumb).getByRole('link', { name: 'Voitures' })).toHaveAttribute('href', '/recherche?category=voitures');
  });

  it('affiche la galerie, les caractéristiques de la catégorie, le badge de prix et le vendeur', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('button', { name: /Voir la photo/ })).toHaveLength(3);
    expect(await screen.findByText('Kilométrage')).toBeInTheDocument();
    expect(screen.getByText(/^80\s000\s?km$/)).toBeInTheDocument();
    expect(screen.getByText('Bon prix')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marie' })).toBeInTheDocument();
  });

  it('met le titre de l\'annonce dans l\'onglet du navigateur', async () => {
    renderPage();
    await screen.findByRole('heading', { level: 1 });
    expect(document.title).toBe('Peugeot 208 en excellent état · LeBonDeal');
  });

  it('affiche la livraison seulement quand elle est possible', async () => {
    serve(adDetail({ shippingAvailable: true }));
    renderPage();
    expect(await screen.findByText('Livraison possible')).toBeInTheDocument();
  });

  it.each([
    ['sold', 'Cette annonce a été vendue.'],
    ['reserved', 'Cette annonce est réservée.'],
  ])('affiche un bandeau pour une annonce « %s »', async (status, message) => {
    serve(adDetail({ status }));
    renderPage();
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('prévient le propriétaire qu\'une annonce archivée ou brouillon n\'est visible que de lui', async () => {
    connected(ad.seller.id);
    serve(adDetail({ status: 'archived' }));
    renderPage();
    expect(await screen.findByText(/archivée : elle n'est visible que de vous/i)).toBeInTheDocument();
  });

  it('affiche « Annonce introuvable » quand l\'API répond 404', async () => {
    serve(notFound());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Annonce introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /voir d'autres annonces/i })).toHaveAttribute('href', '/recherche');
  });

  it('affiche une erreur avec un bouton « Réessayer » pour une autre panne', async () => {
    serve(new Error('réseau coupé'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger cette annonce');
    serve();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Peugeot 208 en excellent état' })).toBeInTheDocument();
  });
});

describe('contacter le vendeur', () => {
  it('invite un visiteur à se connecter', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /se connecter pour contacter le vendeur/i });
    expect(link).toHaveAttribute('href', '/connexion');
    expect(screen.queryByRole('link', { name: 'Contacter le vendeur' })).not.toBeInTheDocument();
  });

  it('propose « Contacter le vendeur » à un utilisateur connecté qui n\'est pas le vendeur', async () => {
    connected();
    renderPage();
    expect(await screen.findByRole('link', { name: 'Contacter le vendeur' })).toHaveAttribute('href', '/compte/messages');
    expect(screen.getByRole('button', { name: /ajouter aux favoris/i })).toBeInTheDocument();
  });

  it('propose « Modifier mon annonce » au propriétaire, et aucun bouton de contact ni de favori', async () => {
    connected(ad.seller.id);
    renderPage();
    expect(await screen.findByRole('link', { name: 'Modifier mon annonce' })).toHaveAttribute('href', `/annonces/${ad.id}/modifier`);
    expect(screen.queryByRole('link', { name: /contacter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /favoris/i })).not.toBeInTheDocument();
  });

  it('ne propose plus de contact pour une annonce vendue', async () => {
    serve(adDetail({ status: 'sold' }));
    connected();
    renderPage();
    await screen.findByText('Cette annonce a été vendue.');
    expect(screen.queryByRole('link', { name: /contacter/i })).not.toBeInTheDocument();
  });
});
