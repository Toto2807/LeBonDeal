import { z } from 'zod';
import * as authService from '../services/authService.js';

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(72), // bcrypt ignore tout au-delà de 72 octets
  displayName: z.string().trim().min(2).max(60),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

// Réponses au format { data } ; les erreurs sont mises en forme par middlewares/errorHandler.js
export async function register(req, res) {
  const user = await authService.register(registerSchema.parse(req.body));
  res.status(201).json({ data: user });
}

export async function login(req, res) {
  const session = await authService.login(loginSchema.parse(req.body));
  res.status(200).json({ data: session });
}

export async function me(req, res) {
  res.status(200).json({ data: await authService.getMe(req.user.id) });
}
