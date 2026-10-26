import { Router } from 'express';
import * as adController from '../controllers/adController.js';
import { requireAuth } from '../middlewares/requireAuth.js';
import { uploadPhotos } from '../middlewares/upload.js';

export const adRouter = Router();

adRouter.get('/', adController.search);
adRouter.post('/', requireAuth, adController.create);
adRouter.post('/:id/images', requireAuth, uploadPhotos, adController.uploadImages);
// Phase 1 à compléter : GET /:id, PATCH /:id, DELETE /:id, PATCH /:id/status (voir le contrat d'API)
