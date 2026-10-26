import { z } from 'zod';
import * as favoriteService from '../services/favoriteService.js';

const adIdSchema = z.uuid();

export async function ids(req, res) {
  res.json({ data: await favoriteService.listIds(req.user.id) });
}

export async function add(req, res) {
  await favoriteService.add(req.user.id, adIdSchema.parse(req.params.adId));
  res.status(204).end();
}

export async function remove(req, res) {
  await favoriteService.remove(req.user.id, adIdSchema.parse(req.params.adId));
  res.status(204).end();
}
