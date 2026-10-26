import { Router } from 'express';
import * as adController from '../controllers/adController.js';
import { optionalAuth, requireAuth } from '../middlewares/requireAuth.js';
import { uploadPhotos } from '../middlewares/upload.js';

export const adRouter = Router();

adRouter.get('/', adController.search);
adRouter.get('/:id', optionalAuth, adController.getOne);
adRouter.post('/', requireAuth, adController.create);
adRouter.patch('/:id', requireAuth, adController.update);
adRouter.delete('/:id', requireAuth, adController.remove);
adRouter.patch('/:id/status', requireAuth, adController.changeStatus);
adRouter.post('/:id/images', requireAuth, uploadPhotos, adController.uploadImages);
adRouter.patch('/:id/images/order', requireAuth, adController.reorderImages);
adRouter.delete('/:id/images/:imageId', requireAuth, adController.removeImage);
