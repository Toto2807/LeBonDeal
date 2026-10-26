import multer from 'multer';
import { HttpError } from '../utils/HttpError.js';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Les photos restent en mémoire le temps d'être redimensionnées par imageService (jamais écrites telles quelles sur le disque).
// Le type MIME envoyé par le client peut être falsifié : imageService vérifie que le fichier est réellement une image.
export const uploadPhotos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) callback(null, true);
    else callback(new HttpError(400, 'UPLOAD_TYPE', 'Formats acceptés : JPEG, PNG ou WebP'));
  },
}).array('photos', 10);
