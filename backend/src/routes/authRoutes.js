import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const authRouter = Router();

// 20 tentatives par quart d'heure et par adresse IP : freine les essais de mots de passe
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

authRouter.post('/register', authLimiter, authController.register);
authRouter.post('/login', authLimiter, authController.login);
authRouter.get('/me', requireAuth, authController.me);
