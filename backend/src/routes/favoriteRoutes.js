import { Router } from 'express';
import * as favoriteController from '../controllers/favoriteController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const favoriteRouter = Router();

favoriteRouter.use(requireAuth); // tout le routeur est réservé aux utilisateurs connectés
favoriteRouter.get('/ids', favoriteController.ids);
favoriteRouter.put('/:adId', favoriteController.add);
favoriteRouter.delete('/:adId', favoriteController.remove);
