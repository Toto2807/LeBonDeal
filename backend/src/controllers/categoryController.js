import * as categoryService from '../services/categoryService.js';

export async function tree(_req, res) {
  res.json({ data: await categoryService.getCategoryTree() });
}

export async function schema(req, res) {
  res.json({ data: await categoryService.getCategorySchema(req.params.slug) });
}
