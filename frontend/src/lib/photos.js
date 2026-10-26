// Mêmes règles que le serveur (middlewares/upload.js) : on répond tout de suite, le serveur contrôle à nouveau.
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

const identity = (file) => `${file.name}:${file.size}:${file.lastModified}`;
const plural = (count, word) => `${count} ${word}${count > 1 ? 's' : ''}`;

// Ajoute `incoming` à `current` en respectant types, taille et nombre maximum. Retourne les fichiers conservés
// et un message par refus. Ne modifie pas `current`.
export function addPhotos(current, incoming, max = 10) {
  const files = [...current];
  const errors = [];
  let overflow = 0;

  for (const file of incoming) {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      errors.push(`${file.name} : format non accepté (JPEG, PNG ou WebP)`);
    } else if (file.size > MAX_PHOTO_BYTES) {
      errors.push(`${file.name} : plus de 8 Mo`);
    } else if (files.some((existing) => identity(existing) === identity(file))) {
      errors.push(`${file.name} : déjà ajoutée`);
    } else if (files.length >= max) {
      overflow += 1;
    } else {
      files.push(file);
    }
  }
  if (overflow > 0) errors.push(`${plural(max, 'photo')} maximum : ${plural(overflow, 'fichier')} ${overflow > 1 ? 'ignorés' : 'ignoré'}`);
  return { files, errors };
}

// Déplace l'élément `index` de `offset` places (−1 = monter, +1 = descendre). Hors limites : liste inchangée.
export function movePhoto(files, index, offset) {
  const target = index + offset;
  if (target < 0 || target >= files.length) return [...files];
  const moved = [...files];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
}
