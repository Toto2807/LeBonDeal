import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { HttpError } from '../utils/HttpError.js';

// Enregistre une photo d'annonce en deux tailles WebP : 1280 px maximum (fiche annonce) et 400×300 (cartes de résultats).
// Retourne les URL publiques servies par express.static('/uploads').
export async function saveAdImage(buffer, uploadDir) {
  const id = randomUUID();
  await mkdir(uploadDir, { recursive: true });

  try {
    const image = sharp(buffer, { failOn: 'error' }).rotate(); // rotate() applique l'orientation EXIF des photos de téléphone
    await Promise.all([
      image.clone()
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(path.join(uploadDir, `${id}.webp`)),
      image.clone()
        .resize({ width: 400, height: 300, fit: 'cover' })
        .webp({ quality: 75 })
        .toFile(path.join(uploadDir, `${id}-thumb.webp`)),
    ]);
  } catch {
    throw new HttpError(400, 'UPLOAD_INVALID', "Ce fichier n'est pas une image lisible");
  }
  return { url: `/uploads/${id}.webp`, thumbUrl: `/uploads/${id}-thumb.webp` };
}
