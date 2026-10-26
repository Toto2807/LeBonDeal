import { ZodError } from 'zod';
import { HttpError } from '../utils/HttpError.js';

const send = (res, status, code, message, details) =>
  res.status(status).json({ error: { code, message, ...(details && { details }) } });

// À brancher en DERNIER dans app.js : app.use(errorHandler)
// Express 5 transmet automatiquement les erreurs des handlers async jusqu'ici.
export function errorHandler(error, _req, res, _next) {
  if (error instanceof HttpError) return send(res, error.status, error.code, error.message);

  // Erreurs de multer (envoi de fichiers) : fichier trop gros -> 413, autre dépassement de limite -> 400
  if (error.name === 'MulterError') {
    const tooBig = error.code === 'LIMIT_FILE_SIZE';
    return send(res, tooBig ? 413 : 400, 'UPLOAD', tooBig ? 'Photo trop lourde (8 Mo maximum)' : 'Envoi de fichiers invalide');
  }

  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
    return send(res, 400, 'VALIDATION', 'Données invalides', details);
  }

  // Erreurs PostgreSQL : 23505 = valeur déjà existante (UNIQUE), 23503 = référence inexistante (clé étrangère)
  if (error.code === '23505') return send(res, 409, 'ALREADY_EXISTS', 'Cette valeur existe déjà');
  if (error.code === '23503') return send(res, 400, 'INVALID_REFERENCE', 'Référence inconnue');

  console.error(error);
  return send(res, 500, 'INTERNAL', 'Erreur interne du serveur');
}
