import { Router } from 'express';
import * as userController from "../controllers/userController.js"
import { requireAuth } from '../middlewares/requireAuth.js'


export const userRouter = Router();
userRouter.use(requireAuth);

// Lire mon profil
userRouter.get('/me', userController.getMe);
// Editer mon profil

// Supprimer mon profil