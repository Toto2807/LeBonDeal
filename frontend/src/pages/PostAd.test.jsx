import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes, useParams } from 'react-router';
import PostAd from './PostAd.jsx';
import { ApiError, api } from '../api/client.js';
import { searchCommunes } from '../lib/geo.js';
import { carSchema, categories } from '../test/fixtures.js';
import { renderApp } from '../test/render.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));
vi.mock('../lib/geo.js', () => ({ searchCommunes: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { id: 'u1', displayName: 'Marie' } }) }));

const AD_ID = '33333333-3333-4333-8333-333333333333';
const DRAFT_KEY = 'lbd_draft_ad:u1';
const lyon = { city: 'Lyon', postalCodes: ['69003'], lat: 45.758, lng: 4.8351 };
const user = userEvent.setup({ applyAccept: false });
const imagesPath = `/ads/${AD_ID}/images`;

function AdPage() {
  const { id } = useParams();
  return <p>Fiche de l'annonce {id}</p>;
}
const renderPage = (options) =>
  renderApp(
    <Routes>
      <Route path="/deposer" element={<PostAd />} />
      <Route path="/annonces/:id" element={<AdPage />} />
    </Routes>,
    { entries: ['/deposer'], ...options }
  );

const serve = ({ createAd, uploadImage } = {}) =>
  api.mockImplementation(async (path, options = {}) => {
    if (path === '/categories') return { data: categories };
    if (path === '/categories/voitures/schema') return { data: carSchema };
    if (path.startsWith('/categories/')) return { data: { categorySlug: path.split('/')[2], fields: [] } };
    if (path === '/ads' && options.method === 'POST') return createAd ? createAd() : { data: { id: AD_ID } };
    if (path === imagesPath) return uploadImage ? uploadImage() : { data: [{ id: 'img' }] };
    throw new Error(`appel inattendu : ${path}`);
  });

const next = () => user.click(screen.getByRole('button', { name: 'Continuer' }));
const chooseCategory = async (name = 'Voitures') => user.click(await screen.findByRole('radio', { name }));
async function fillDetails() {
  await user.type(screen.getByLabelText('Titre'), 'Peugeot 208 diesel');
  await user.type(screen.getByLabelText('Description'), 'Très bon état, entretien suivi.');
  await user.selectOptions(screen.getByLabelText('État'), 'good');
  await user.selectOptions(await screen.findByLabelText(/Marque/), 'Peugeot');
  await user.type(screen.getByLabelText(/Modèle/), 'Clio');
  await user.type(screen.getByLabelText(/Année/), '2019');
  await user.type(screen.getByLabelText(/Kilométrage/), '80000');
  await user.selectOptions(screen.getByLabelText(/Carburant/), 'Diesel');
}
const photoFile = (name, lastModified) => new File(['x'], name, { type: 'image/jpeg', lastModified });
async function addPhotos(count) {
  const files = Array.from({ length: count }, (_, i) => photoFile(`photo-${i}.jpg`, i + 1));
  await user.upload(screen.getByLabelText(/glissez vos photos/i), files);
}
async function fillPriceAndPlace() {
  await user.type(screen.getByLabelText(/^Prix/), '8 500');
  await user.type(screen.getByLabelText('Ville'), 'Lyon');
  await user.click(await screen.findByRole('button', { name: 'Lyon (69003)' }));
}
// Parcourt le formulaire jusqu'au récapitulatif.
async function reachSummary({ photos = 2 } = {}) {
  await chooseCategory();
  await next();
  await fillDetails();
  await next();
  await addPhotos(photos);
  await next();
  await fillPriceAndPlace();
  await next();
  await screen.findByRole('heading', { name: 'Récapitulatif' });
}
const publish = () => user.click(screen.getByRole('button', { name: 'Publier mon annonce' }));
const imageUploads = () => api.mock.calls.filter(([path]) => path === imagesPath);
const adCreations = () => api.mock.calls.filter(([path, options]) => path === '/ads' && options?.method === 'POST');

beforeEach(() => {
  api.mockReset();
  searchCommunes.mockReset();
  searchCommunes.mockResolvedValue([lyon]);
  localStorage.clear();
  serve();
});

describe('déposer une annonce : validation étape par étape', () => {
  it('commence par le choix de la catégorie, avec les deux niveaux', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Déposer une annonce' })).toBeInTheDocument();
    expect(await screen.findByRole('group', { name: 'Véhicules' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Voitures' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Locations' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Catégorie');
  });

  it('refuse de continuer sans catégorie', async () => {
    renderPage();
    await screen.findByRole('radio', { name: 'Voitures' });
    await next();
    expect(await screen.findByText('Choisissez une catégorie')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Catégorie' })).toBeInTheDocument();
  });

  it('refuse des détails incomplets, champs de la catégorie compris', async () => {
    renderPage();
    await chooseCategory();
    await next();
    await screen.findByLabelText(/Marque/);
    await next();
    expect(await screen.findByText('Le titre doit contenir au moins 3 caractères')).toBeInTheDocument();
    expect(screen.getByText('La description doit contenir au moins 10 caractères')).toBeInTheDocument();
    expect(screen.getAllByText('Champ obligatoire').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByRole('heading', { name: 'Détails' })).toBeInTheDocument();
  });

  it('place le focus sur le premier champ invalide (clavier et lecteurs d\'écran)', async () => {
    renderPage();
    await chooseCategory();
    await next();
    await screen.findByLabelText(/Marque/);
    await next();
    await screen.findByText('Le titre doit contenir au moins 3 caractères');
    expect(screen.getByLabelText('Titre')).toHaveFocus();
    expect(screen.getByLabelText('Titre')).toHaveAttribute('aria-invalid', 'true');
  });

  it('amène le focus sur le titre de chaque nouvelle étape', async () => {
    renderPage();
    await chooseCategory();
    await next();
    expect(await screen.findByRole('heading', { name: 'Détails' })).toHaveFocus();
  });

  it('ne prend pas le focus au chargement de la page, même en mode strict (développement)', async () => {
    renderPage({ strict: true });
    await screen.findByRole('radio', { name: 'Voitures' });
    expect(screen.getByRole('heading', { name: 'Catégorie' })).not.toHaveFocus();
  });

  it('refuse un prix invalide et une ville non choisie dans la liste', async () => {
    renderPage();
    await chooseCategory();
    await next();
    await fillDetails();
    await next();
    await next(); // photos : facultatives
    await user.type(await screen.findByLabelText(/^Prix/), 'abc');
    await next();
    expect(await screen.findByText('Indiquez un prix en euros (0 si gratuit)')).toBeInTheDocument();
    expect(screen.getByText('Choisissez une ville dans la liste')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prix et lieu' })).toBeInTheDocument();
  });

  it('permet de revenir en arrière sans perdre ce qui a été saisi', async () => {
    renderPage();
    await chooseCategory();
    await next();
    await user.type(screen.getByLabelText('Titre'), 'Mon titre');
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByRole('radio', { name: 'Voitures' })).toBeChecked();
    await next();
    expect(screen.getByLabelText('Titre')).toHaveValue('Mon titre');
  });
});

describe('déposer une annonce : publication', () => {
  it('crée l\'annonce, envoie les photos une par une, puis ouvre la fiche', async () => {
    renderPage();
    await reachSummary({ photos: 2 });
    expect(screen.getByText('Peugeot 208 diesel')).toBeInTheDocument();
    expect(screen.getByText(/^8\s500\s€$/)).toBeInTheDocument();
    expect(screen.getByText(/2 photos/)).toBeInTheDocument();
    // le récapitulatif montre les champs de la catégorie comme la fiche : unité et milliers, mais l'année telle quelle
    expect(screen.getByText(/^80\s000\skm$/)).toBeInTheDocument();
    expect(screen.getByText('2019')).toBeInTheDocument();

    await publish();
    expect(await screen.findByText(`Fiche de l'annonce ${AD_ID}`)).toBeInTheDocument();

    expect(adCreations()).toHaveLength(1);
    expect(adCreations()[0][1].body).toEqual({
      title: 'Peugeot 208 diesel',
      description: 'Très bon état, entretien suivi.',
      priceCents: 850000,
      categorySlug: 'voitures',
      itemCondition: 'good',
      city: 'Lyon',
      postalCode: '69003',
      lat: 45.758,
      lng: 4.8351,
      shippingAvailable: false,
      attributes: { marque: 'Peugeot', modele: 'Clio', annee: 2019, kilometrage: 80000, carburant: 'Diesel' },
    });
    // une photo par requête : chaque requête reste sous la limite de taille du serveur web
    expect(imageUploads()).toHaveLength(2);
    for (const [, options] of imageUploads()) {
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
      expect(options.body.getAll('photos')).toHaveLength(1);
    }
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('publie aussi sans photo', async () => {
    renderPage();
    await reachSummary({ photos: 0 });
    await publish();
    expect(await screen.findByText(`Fiche de l'annonce ${AD_ID}`)).toBeInTheDocument();
    expect(imageUploads()).toHaveLength(0);
  });

  it('ne crée qu\'une annonce même en cas de double clic', async () => {
    serve({ createAd: () => new Promise((resolve) => setTimeout(() => resolve({ data: { id: AD_ID } }), 50)) });
    renderPage();
    await reachSummary({ photos: 1 });
    await user.dblClick(screen.getByRole('button', { name: 'Publier mon annonce' }));
    expect(await screen.findByText(`Fiche de l'annonce ${AD_ID}`)).toBeInTheDocument();
    expect(adCreations()).toHaveLength(1);
  });

  it('refus du serveur à la création : message clair, aucune photo envoyée, brouillon conservé', async () => {
    serve({ createAd: () => { throw new ApiError(400, { error: { code: 'VALIDATION', message: 'Données invalides' } }); } });
    renderPage();
    await reachSummary();
    await publish();
    expect(await screen.findByRole('alert')).toHaveTextContent('Données invalides');
    expect(imageUploads()).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Publier mon annonce' })).toBeEnabled();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)).title).toBe('Peugeot 208 diesel');
  });

  it('panne réseau à la création : message clair et on peut réessayer', async () => {
    serve({ createAd: () => { throw new TypeError('Failed to fetch'); } });
    renderPage();
    await reachSummary();
    await publish();
    expect(await screen.findByRole('alert')).toHaveTextContent('Publication impossible');
    expect(screen.getByRole('button', { name: 'Publier mon annonce' })).toBeEnabled();
  });

  it('photos refusées après la création : l\'annonce n\'est ni perdue ni recréée', async () => {
    serve({ uploadImage: () => { throw new TypeError('Failed to fetch'); } });
    renderPage();
    await reachSummary({ photos: 3 });
    await publish();

    expect(await screen.findByText(/Annonce créée, mais les photos n'ont pas pu être envoyées/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Modifier mon annonce' })).toHaveAttribute('href', `/annonces/${AD_ID}/modifier`);
    expect(screen.getByRole('link', { name: 'Voir mon annonce' })).toHaveAttribute('href', `/annonces/${AD_ID}`);
    expect(adCreations()).toHaveLength(1);
    expect(imageUploads()).toHaveLength(1); // on s'arrête à la première photo refusée
    expect(screen.queryByText(/Fiche de l'annonce/)).not.toBeInTheDocument();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull(); // l'annonce existe : le brouillon ne sert plus
  });

  it('indique combien de photos ont été envoyées quand la panne survient en cours de route', async () => {
    let calls = 0;
    serve({ uploadImage: () => { calls += 1; if (calls === 2) throw new TypeError('Failed to fetch'); return { data: [{ id: 'img' }] }; } });
    renderPage();
    await reachSummary({ photos: 3 });
    await publish();
    expect(await screen.findByText(/1 photo sur 3 envoyée/)).toBeInTheDocument();
  });
});

describe('déposer une annonce : brouillon', () => {
  it('enregistre la saisie au fur et à mesure', async () => {
    renderPage();
    await chooseCategory();
    await next();
    await user.type(screen.getByLabelText('Titre'), 'Vélo');
    await waitFor(() => expect(JSON.parse(localStorage.getItem(DRAFT_KEY)).title).toBe('Vélo'));
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)).categorySlug).toBe('voitures');
  });

  it('restaure un brouillon et propose de recommencer à zéro', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ categorySlug: 'voitures', title: 'Mon brouillon', description: '', itemCondition: '', attributes: {}, price: '', place: null, shippingAvailable: false }));
    renderPage();
    expect(await screen.findByText(/Brouillon restauré/)).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'Voitures' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Recommencer à zéro' }));
    expect(screen.queryByText(/Brouillon restauré/)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Voitures' })).not.toBeChecked();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('ignore un brouillon corrompu', async () => {
    localStorage.setItem(DRAFT_KEY, '{pas du json');
    renderPage();
    expect(await screen.findByRole('radio', { name: 'Voitures' })).not.toBeChecked();
    expect(screen.queryByText(/Brouillon restauré/)).not.toBeInTheDocument();
  });
});
