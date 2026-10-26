import { z } from 'zod';
import * as adService from '../services/adService.js';
import { searchAds } from '../repositories/adRepository.js';
import { createAdSchema, searchQuerySchema } from '../schemas/adSchemas.js';

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

// POST /api/ads/:id/images — formulaire multipart, champ « photos » (jusqu'à 10 fichiers)
export async function uploadImages(req, res) {
  const adId = z.uuid().parse(req.params.id);
  const images = await adService.addImages(req.user.id, adId, req.files ?? []);
  res.status(201).json({ data: images });
}
