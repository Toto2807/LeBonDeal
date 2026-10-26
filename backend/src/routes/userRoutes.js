import { Router } from 'express';
import * as userController from '../controllers/userController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const userRouter = Router();

userRouter.get('/me/ads', requireAuth, userController.myAds);
