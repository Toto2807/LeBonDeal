import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { saveAdImage } from '../../src/services/imageService.js';
import { uploadPhotos } from '../../src/middlewares/upload.js';
import { errorHandler } from '../../src/middlewares/errorHandler.js';

const fakePhoto = () => sharp({ create: { width: 2400, height: 1800, channels: 3, background: '#ff6e14' } }).png().toBuffer();

test('saveAdImage produit une image 1280 px et une miniature 400x300 en WebP', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lebondeal-'));
  try {
    const { url, thumbUrl } = await saveAdImage(await fakePhoto(), dir);

    // lecture en mémoire : sharp garde les fichiers ouverts sous Windows, ce qui empêcherait de supprimer le dossier
    const full = await sharp(await readFile(path.join(dir, path.basename(url)))).metadata();
    assert.equal(full.format, 'webp');
    assert.equal(full.width, 1280);
    assert.equal(full.height, 960); // le ratio 4:3 est conservé

    const thumb = await sharp(await readFile(path.join(dir, path.basename(thumbUrl)))).metadata();
    assert.deepEqual([thumb.width, thumb.height], [400, 300]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveAdImage refuse un fichier qui n\'est pas une image', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lebondeal-'));
  try {
    await assert.rejects(saveAdImage(Buffer.from('ceci est du texte'), dir), { code: 'UPLOAD_INVALID', status: 400 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('la route d\'envoi accepte une photo et refuse les mauvais types et les fichiers trop lourds', async () => {
  const app = express();
  app.post('/upload', uploadPhotos, (req, res) => res.status(201).json({ count: req.files.length }));
  app.use(errorHandler);

  const ok = await request(app).post('/upload').attach('photos', await fakePhoto(), { filename: 'a.png', contentType: 'image/png' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.count, 1);

  const wrongType = await request(app).post('/upload').attach('photos', Buffer.from('<script>'), { filename: 'a.html', contentType: 'text/html' });
  assert.equal(wrongType.status, 400);
  assert.equal(wrongType.body.error.code, 'UPLOAD_TYPE');

  const tooBig = await request(app).post('/upload').attach('photos', Buffer.alloc(9 * 1024 * 1024), { filename: 'big.png', contentType: 'image/png' });
  assert.equal(tooBig.status, 413);
});
