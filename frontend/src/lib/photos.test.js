import { describe, expect, it } from 'vitest';
import { addPhotos, movePhoto } from './photos.js';

const photo = (name, { type = 'image/jpeg', size = 1000, lastModified = 1 } = {}) => {
  const file = new File(['x'], name, { type, lastModified });
  Object.defineProperty(file, 'size', { value: size }); // évite d'allouer de vrais mégaoctets
  return file;
};

describe('addPhotos', () => {
  it('accepte JPEG, PNG et WebP', () => {
    const { files, errors } = addPhotos([], [photo('a.jpg'), photo('b.png', { type: 'image/png' }), photo('c.webp', { type: 'image/webp' })]);
    expect(files.map((f) => f.name)).toEqual(['a.jpg', 'b.png', 'c.webp']);
    expect(errors).toEqual([]);
  });

  it('refuse un format non accepté, en nommant le fichier', () => {
    const { files, errors } = addPhotos([], [photo('doc.pdf', { type: 'application/pdf' }), photo('a.jpg')]);
    expect(files.map((f) => f.name)).toEqual(['a.jpg']);
    expect(errors).toEqual(['doc.pdf : format non accepté (JPEG, PNG ou WebP)']);
  });

  it('refuse un fichier de plus de 8 Mo mais accepte exactement 8 Mo', () => {
    const eight = 8 * 1024 * 1024;
    const { files, errors } = addPhotos([], [photo('gros.jpg', { size: eight + 1 }), photo('limite.jpg', { size: eight })]);
    expect(files.map((f) => f.name)).toEqual(['limite.jpg']);
    expect(errors).toEqual(['gros.jpg : plus de 8 Mo']);
  });

  it('plafonne à 10 photos et signale combien de fichiers sont ignorés', () => {
    const current = Array.from({ length: 9 }, (_, i) => photo(`p${i}.jpg`, { lastModified: i }));
    const { files, errors } = addPhotos(current, [photo('x.jpg', { lastModified: 100 }), photo('y.jpg', { lastModified: 101 }), photo('z.jpg', { lastModified: 102 })]);
    expect(files).toHaveLength(10);
    expect(files.at(-1).name).toBe('x.jpg');
    expect(errors).toEqual(['10 photos maximum : 2 fichiers ignorés']);
  });

  it('respecte un maximum plus petit (annonce qui a déjà des photos)', () => {
    const { files, errors } = addPhotos([], [photo('a.jpg', { lastModified: 1 }), photo('b.jpg', { lastModified: 2 })], 1);
    expect(files).toHaveLength(1);
    expect(errors).toEqual(['1 photo maximum : 1 fichier ignoré']);
  });

  it('refuse la même photo ajoutée deux fois', () => {
    const first = photo('a.jpg');
    const { files, errors } = addPhotos([first], [photo('a.jpg')]);
    expect(files).toHaveLength(1);
    expect(errors).toEqual(['a.jpg : déjà ajoutée']);
  });

  it('ne modifie pas la liste d\'origine', () => {
    const current = [photo('a.jpg')];
    addPhotos(current, [photo('b.jpg', { lastModified: 2 })]);
    expect(current).toHaveLength(1);
  });
});

describe('movePhoto', () => {
  const list = ['a', 'b', 'c'];

  it('monte et descend une photo', () => {
    expect(movePhoto(list, 1, -1)).toEqual(['b', 'a', 'c']);
    expect(movePhoto(list, 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('ne fait rien au-delà des bornes, et ne modifie pas la liste d\'origine', () => {
    expect(movePhoto(list, 0, -1)).toEqual(list);
    expect(movePhoto(list, 2, 1)).toEqual(list);
    movePhoto(list, 1, 1);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});
