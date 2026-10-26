import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { HttpError } from '../utils/HttpError.js';

// Place req.user = { id, role } si le jeton « Authorization: Bearer <jeton> » est valide, sinon répond 401.
export function requireAuth(req, _res, next) {
  const [scheme, token] = (req.header('Authorization') ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'TOKEN_MISSING', 'Authentification requise');
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    throw new HttpError(401, 'TOKEN_INVALID', 'Session expirée ou invalide');
  }
  next();
}

export const requireRole = (role) => (req, _res, next) => {
  if (req.user?.role !== role) throw new HttpError(403, 'FORBIDDEN', 'Accès refusé');
  next();
};
