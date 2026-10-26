import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/postgres.js';
import { config } from '../config/env.js';
import { HttpError } from '../utils/HttpError.js';

export async function register({ email, password, displayName }) {
  const passwordHash = await bcrypt.hash(password, 10);
  // L'unicité de l'e-mail est garantie par la base (colonne citext UNIQUE) : pas de « vérifier puis insérer ».
  const [user] = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id, email, display_name, role`,
    [email, passwordHash, displayName]
  );
  return user;
}

export async function login({ email, password }) {
  const [user] = await query(
    'SELECT id, email, display_name, role, password_hash, is_banned FROM users WHERE email = $1',
    [email]
  );
  // Même message si l'e-mail est inconnu ou si le mot de passe est faux : on ne révèle pas quels comptes existent.
  const valid = user && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect');
  if (user.isBanned) throw new HttpError(403, 'BANNED', 'Compte suspendu');

  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: '7d' });
  return { token, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role } };
}

export async function getMe(userId) {
  const [user] = await query(
    `SELECT id, email, display_name, avatar_url, city, postal_code, role, created_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Utilisateur introuvable');
  return user;
}
