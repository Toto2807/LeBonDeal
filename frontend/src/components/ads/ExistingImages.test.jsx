import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExistingImages from './ExistingImages.jsx';
import { ApiError, api } from '../../api/client.js';
import { adDetail } from '../../test/fixtures.js';
import { renderApp } from '../../test/render.jsx';

vi.mock('../../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), api: vi.fn() }));

const AD_ID = adDetail().id;
const { images } = adDetail(); // img-1, img-2, img-3
const renderImages = (list = images) => renderApp(<ExistingImages adId={AD_ID} images={list} />);

beforeEach(() => {
  api.mockReset();
  api.mockResolvedValue({ data: [] });
});

describe('ExistingImages', () => {
  it('affiche les photos de l\'annonce avec leurs commandes', () => {
    renderImages();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Retirer la photo existante 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Monter la photo existante 1' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descendre la photo existante 3' })).toBeDisabled();
  });

  it('n\'affiche rien quand l\'annonce n\'a pas de photo', () => {
    const { container } = renderImages([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('supprime tout de suite la photo côté serveur', async () => {
    renderImages();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la photo existante 2' }));
    expect(api).toHaveBeenCalledWith(`/ads/${AD_ID}/images/img-2`, { method: 'DELETE' });
  });

  it('envoie la liste complète dans le nouvel ordre quand on descend une photo', async () => {
    renderImages();
    await userEvent.click(screen.getByRole('button', { name: 'Descendre la photo existante 1' }));
    expect(api).toHaveBeenCalledWith(`/ads/${AD_ID}/images/order`, { method: 'PATCH', body: { ids: ['img-2', 'img-1', 'img-3'] } });
  });

  it('envoie la liste complète dans le nouvel ordre quand on monte une photo', async () => {
    renderImages();
    await userEvent.click(screen.getByRole('button', { name: 'Monter la photo existante 3' }));
    expect(api).toHaveBeenCalledWith(`/ads/${AD_ID}/images/order`, { method: 'PATCH', body: { ids: ['img-1', 'img-3', 'img-2'] } });
  });

  it('désactive les commandes pendant une opération (pas deux modifications en même temps)', async () => {
    api.mockReturnValue(new Promise(() => {}));
    renderImages();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la photo existante 1' }));
    expect(screen.getByRole('button', { name: 'Retirer la photo existante 2' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descendre la photo existante 2' })).toBeDisabled();
  });

  it('affiche le message du serveur quand l\'opération échoue', async () => {
    api.mockRejectedValue(new ApiError(409, { error: { code: 'AD_NOT_EDITABLE', message: 'Une annonce vendue ne peut plus être modifiée' } }));
    renderImages();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la photo existante 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Une annonce vendue ne peut plus être modifiée');
  });

  it('affiche un message clair quand le réseau est coupé', async () => {
    api.mockRejectedValue(new TypeError('Failed to fetch'));
    renderImages();
    await userEvent.click(screen.getByRole('button', { name: 'Retirer la photo existante 1' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de modifier les photos');
  });
});
