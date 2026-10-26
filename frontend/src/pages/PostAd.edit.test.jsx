import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useParams } from 'react-router';
import PostAd from './PostAd.jsx';
import { ApiError, api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { searchCommunes } from '../lib/geo.js';
import { adDetail, carSchema, categories } from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));
vi.mock('../lib/geo.js', () => ({ searchCommunes: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

const OWNER = 'u1';
const ad = adDetail({ seller: { ...adDetail().seller, id: OWNER } });
const user = userEvent.setup({ applyAccept: false });

function AdPage() {
  const { id } = useParams();
  return <p>Fiche de l'annonce {id}</p>;
}
const renderEdit = () =>
  renderApp(
    <Routes>
      <Route path="/annonces/:id/modifier" element={<PostAd />} />
      <Route path="/annonces/:id" element={<AdPage />} />
    </Routes>,
    { entries: [`/annonces/${ad.id}/modifier`] }
  );

const serve = ({ detail = ad, save, uploadImage } = {}) =>
  api.mockImplementation(async (path, options = {}) => {
    if (path === `/ads/${ad.id}` && !options.method) {
      if (detail instanceof Error) throw detail;
      return { data: detail };
    }
    if (path === `/ads/${ad.id}` && options.method === 'PATCH') return save ? save() : { data: ad };
    if (path === `/ads/${ad.id}/images` && options.method === 'POST') return uploadImage ? uploadImage() : { data: [{ id: 'new' }] };
    if (path.startsWith(`/ads/${ad.id}/images/`)) return { data: [] };
    if (path === '/categories') return { data: categories };
    if (path === '/categories/voitures/schema') return { data: carSchema };
    throw new Error(`appel inattendu : ${path}`);
  });

const next = () => user.click(screen.getByRole('button', { name: 'Continuer' }));
const writes = (method) => api.mock.calls.filter(([path, options]) => path === `/ads/${ad.id}` && options?.method === method);
const uploads = () => api.mock.calls.filter(([path]) => path === `/ads/${ad.id}/images`);
const photoFile = (name, lastModified = 1) => new File(['x'], name, { type: 'image/jpeg', lastModified });
async function reachSummary() {
  await screen.findByLabelText('Titre');
  await next(); // détails → photos
  await next(); // photos → prix et lieu
  await next(); // prix et lieu → récapitulatif
  await screen.findByRole('heading', { name: 'Récapitulatif' });
}

beforeEach(() => {
  api.mockReset();
  searchCommunes.mockReset();
  localStorage.clear();
  useAuth.mockReturnValue({ user: { id: OWNER, displayName: 'Marie' } });
  serve();
});

describe('modifier une annonce : chargement et droits', () => {
  it('annonce le chargement', () => {
    api.mockImplementation(() => new Promise(() => {}));
    renderEdit();
    expect(screen.getByRole('status')).toHaveTextContent("Chargement de l'annonce");
  });

  it('affiche « Annonce introuvable » quand l\'API répond 404', async () => {
    serve({ detail: new ApiError(404, { error: { code: 'AD_NOT_FOUND', message: 'Annonce introuvable' } }) });
    renderEdit();
    expect(await screen.findByRole('heading', { name: 'Annonce introuvable' })).toBeInTheDocument();
  });

  it('refuse à un utilisateur qui n\'est pas le vendeur, sans afficher le formulaire', async () => {
    useAuth.mockReturnValue({ user: { id: 'un-autre', displayName: 'Paul' } });
    renderEdit();
    expect(await screen.findByRole('heading', { name: 'Vous ne pouvez pas modifier cette annonce' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Titre')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Voir l'annonce" })).toHaveAttribute('href', `/annonces/${ad.id}`);
  });

  it('refuse de modifier une annonce vendue', async () => {
    serve({ detail: adDetail({ status: 'sold', seller: { ...ad.seller } }) });
    renderEdit();
    expect(await screen.findByRole('heading', { name: 'Une annonce vendue ne peut plus être modifiée' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Titre')).not.toBeInTheDocument();
  });
});

describe('modifier une annonce : formulaire prérempli', () => {
  it('reprend les valeurs de l\'annonce et n\'affiche pas l\'étape « Catégorie »', async () => {
    renderEdit();
    expect(await screen.findByLabelText('Titre')).toHaveValue('Peugeot 208 en excellent état');
    expect(screen.getByLabelText('Description')).toHaveValue('Très bon état, entretien suivi, contrôle technique valide.');
    expect(screen.getByLabelText('État')).toHaveValue('good');
    expect(await screen.findByLabelText(/Marque/)).toHaveValue('Peugeot');
    expect(screen.getByLabelText(/Kilométrage/)).toHaveValue(80000);
    expect(screen.getByRole('heading', { level: 1, name: "Modifier l'annonce" })).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).not.toContain('1Catégorie');
    expect(screen.getByText('Voitures')).toBeInTheDocument(); // catégorie affichée en lecture seule
  });

  it('préremplit le prix et la ville à l\'étape suivante', async () => {
    renderEdit();
    await screen.findByLabelText('Titre');
    await next();
    await next();
    expect(await screen.findByLabelText(/^Prix/)).toHaveValue('8500');
    expect(screen.getByLabelText('Ville')).toHaveValue('Lyon (69003)');
  });

  it('n\'enregistre aucun brouillon en mode modification', async () => {
    renderEdit();
    await user.type(await screen.findByLabelText('Titre'), ' !');
    expect(Object.keys(localStorage)).toEqual([]);
    expect(screen.queryByText(/Brouillon restauré/)).not.toBeInTheDocument();
  });

  it('valide toujours les champs : un titre vidé est refusé', async () => {
    renderEdit();
    await user.clear(await screen.findByLabelText('Titre'));
    await next();
    expect(await screen.findByText('Le titre doit contenir au moins 3 caractères')).toBeInTheDocument();
  });
});

describe('modifier une annonce : enregistrement', () => {
  it('envoie les modifications (sans la catégorie) puis ouvre la fiche', async () => {
    renderEdit();
    const title = await screen.findByLabelText('Titre');
    await user.clear(title);
    await user.type(title, 'Peugeot 208 vendue vite');
    await reachSummary();
    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));

    expect(await screen.findByText(`Fiche de l'annonce ${ad.id}`)).toBeInTheDocument();
    expect(writes('PATCH')).toHaveLength(1);
    const body = writes('PATCH')[0][1].body;
    expect(body).toMatchObject({ title: 'Peugeot 208 vendue vite', priceCents: 850000, city: 'Lyon', postalCode: '69003', itemCondition: 'good' });
    expect(body).not.toHaveProperty('categorySlug');
    expect(body.attributes).toEqual({ marque: 'Peugeot', modele: '208', annee: 2019, kilometrage: 80000, carburant: 'Diesel' });
    expect(uploads()).toHaveLength(0);
  });

  it('envoie les nouvelles photos une par une après l\'enregistrement', async () => {
    renderEdit();
    await screen.findByLabelText('Titre');
    await next();
    await user.upload(screen.getByLabelText(/glissez vos photos/i), [photoFile('a.jpg', 1), photoFile('b.jpg', 2)]);
    await next();
    await next();
    await user.click(await screen.findByRole('button', { name: 'Enregistrer les modifications' }));

    expect(await screen.findByText(`Fiche de l'annonce ${ad.id}`)).toBeInTheDocument();
    expect(uploads()).toHaveLength(2);
    expect(uploads()[0][1].body.getAll('photos')).toHaveLength(1);
  });

  it('limite les nouvelles photos à la place restante (10 moins les photos existantes)', async () => {
    renderEdit();
    await screen.findByLabelText('Titre');
    await next();
    expect(await screen.findByText(/7 photos maximum/)).toBeInTheDocument(); // 3 photos existantes
  });

  it('modifications enregistrées mais photos refusées : message clair, une seule modification envoyée', async () => {
    serve({ uploadImage: () => { throw new TypeError('Failed to fetch'); } });
    renderEdit();
    await screen.findByLabelText('Titre');
    await next();
    await user.upload(screen.getByLabelText(/glissez vos photos/i), [photoFile('a.jpg')]);
    await next();
    await next();
    await user.click(await screen.findByRole('button', { name: 'Enregistrer les modifications' }));

    expect(await screen.findByText(/Modifications enregistrées, mais les photos n'ont pas pu être envoyées/)).toBeInTheDocument();
    expect(writes('PATCH')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Voir mon annonce' })).toHaveAttribute('href', `/annonces/${ad.id}`);
    expect(screen.queryByText(/Fiche de l'annonce/)).not.toBeInTheDocument();
  });

  it('affiche le message du serveur quand l\'enregistrement est refusé', async () => {
    serve({ save: () => { throw new ApiError(409, { error: { code: 'AD_NOT_EDITABLE', message: 'Une annonce vendue ne peut plus être modifiée' } }); } });
    renderEdit();
    await reachSummary();
    await user.click(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Une annonce vendue ne peut plus être modifiée');
    expect(screen.getByRole('button', { name: 'Enregistrer les modifications' })).toBeEnabled();
    expect(uploads()).toHaveLength(0);
  });

  it('n\'enregistre qu\'une fois en cas de double clic', async () => {
    serve({ save: () => new Promise((resolve) => setTimeout(() => resolve({ data: ad }), 50)) });
    renderEdit();
    await reachSummary();
    await user.dblClick(screen.getByRole('button', { name: 'Enregistrer les modifications' }));
    expect(await screen.findByText(`Fiche de l'annonce ${ad.id}`)).toBeInTheDocument();
    expect(writes('PATCH')).toHaveLength(1);
  });
});

describe('modifier une annonce : photos existantes', () => {
  it('liste les photos existantes à l\'étape Photos et supprime tout de suite côté serveur', async () => {
    renderEdit();
    await screen.findByLabelText('Titre');
    await next();
    expect(await screen.findByRole('button', { name: 'Retirer la photo existante 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retirer la photo existante 1' }));
    expect(api).toHaveBeenCalledWith(`/ads/${ad.id}/images/img-1`, { method: 'DELETE' });
  });
});
