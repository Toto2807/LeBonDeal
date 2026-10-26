import { z } from 'zod';
import * as adService from '../services/adService.js';
import { searchAds } from '../repositories/adRepository.js';
import { createAdSchema, reorderSchema, searchQuerySchema, statusSchema, updateAdSchema } from '../schemas/adSchemas.js';

export async function create(req, res) {
  const ad = await adService.createAd(req.user.id, createAdSchema.parse(req.body));
  res.status(201).json({ data: ad });
}

// GET /api/ads?q=velo&category=velos&priceMax=30000&sort=price_asc&page=2&attr.type=VTT&attr.prix.max=...
export async function search(req, res) {
  const filters = searchQuerySchema.parse(req.query);
  // Express 5 laisse les clés « attr.xxx » à plat dans req.query : on les regroupe ici
  const rawAttributes = Object.fromEntries(
    Object.entries(req.query).filter(([key]) => key.startsWith('attr.')).map(([key, value]) => [key.slice(5), value])
  );
  const { items, total } = await searchAds(filters, rawAttributes);
  res.json({ data: items, meta: { total, page: filters.page, limit: filters.limit } });
}

// GET /api/ads/:id — public ; un jeton valide permet au propriétaire de voir ses brouillons et annonces archivées
export async function getOne(req, res) {
  const adId = z.uuid().parse(req.params.id);
  res.json({ data: await adService.getAd(adId, req.user?.id ?? null) });
}

// PATCH /api/ads/:id — propriétaire seulement ; renvoie la fiche mise à jour
export async function update(req, res) {
  const adId = z.uuid().parse(req.params.id);
  const patch = updateAdSchema.parse(req.body);
  res.json({ data: await adService.updateAd(req.user.id, adId, patch) });
}

// DELETE /api/ads/:id — suppression logique
export async function remove(req, res) {
  await adService.deleteAd(req.user.id, z.uuid().parse(req.params.id));
  res.status(204).end();
}

// PATCH /api/ads/:id/status — { status, buyerId? }
export async function changeStatus(req, res) {
  const adId = z.uuid().parse(req.params.id);
  const body = statusSchema.parse(req.body);
  res.json({ data: await adService.changeStatus(req.user.id, adId, body) });
}

// DELETE /api/ads/:id/images/:imageId
export async function removeImage(req, res) {
  const adId = z.uuid().parse(req.params.id);
  const imageId = z.uuid().parse(req.params.imageId);
  await adService.removeImage(req.user.id, adId, imageId);
  res.status(204).end();
}

// PATCH /api/ads/:id/images/order — { ids: [...] } : la liste complète des photos dans le nouvel ordre
export async function reorderImages(req, res) {
  const adId = z.uuid().parse(req.params.id);
  const { ids } = reorderSchema.parse(req.body);
  res.json({ data: await adService.reorderImages(req.user.id, adId, ids) });
}

// POST /api/ads/:id/images — formulaire multipart, champ « photos » (jusqu'à 10 fichiers)
export async function uploadImages(req, res) {
  const adId = z.uuid().parse(req.params.id);
  const images = await adService.addImages(req.user.id, adId, req.files ?? []);
  res.status(201).json({ data: images });
}
