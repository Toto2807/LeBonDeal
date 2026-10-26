import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sans l'option « globals » de Vitest, Testing Library ne nettoie pas le DOM tout seul entre deux tests.
afterEach(cleanup);

// jsdom ne sait pas fabriquer d'aperçu d'image (URL.createObjectURL) : un bouchon suffit pour les tests.
if (!URL.createObjectURL) {
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = () => {};
}
