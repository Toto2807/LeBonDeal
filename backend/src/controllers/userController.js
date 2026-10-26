import * as adService from '../services/adService.js';
import { myAdsQuerySchema } from '../schemas/adSchemas.js';

// GET /api/users/me/ads?status=sold&page=1&limit=20
export async function myAds(req, res) {
  const query = myAdsQuerySchema.parse(req.query);
  const { items, total } = await adService.listMyAds(req.user.id, query);
  res.json({ data: items, meta: { total, page: query.page, limit: query.limit } });
}
