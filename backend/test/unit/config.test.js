import test from 'node:test';
import assert from 'node:assert/strict';
import { assertConfig } from '../../src/config/env.js';

const REQUIRED = ['DATABASE_URL', 'MONGODB_URI', 'JWT_SECRET'];

// Exécute `work` avec exactement ces variables définies, puis remet l'environnement dans son état d'origine.
function withEnv(values, work) {
  const saved = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name]]));
  const apply = (source) => {
    for (const name of REQUIRED) {
      if (source[name] === undefined) delete process.env[name];
      else process.env[name] = source[name];
    }
  };
  apply(values);
  try {
    work();
  } finally {
    apply(saved);
  }
}

test('assertConfig liste les variables manquantes', () => {
  withEnv({}, () => {
    assert.throws(() => assertConfig(), /DATABASE_URL, MONGODB_URI, JWT_SECRET/);
  });
});

test('assertConfig ne lève rien quand tout est défini', () => {
  withEnv({ DATABASE_URL: 'x', MONGODB_URI: 'y', JWT_SECRET: 'z' }, () => {
    assert.doesNotThrow(() => assertConfig());
  });
});
