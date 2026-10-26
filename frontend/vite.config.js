import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En local le backend est sur localhost:3000 ; dans Docker, compose fournit VITE_PROXY_TARGET=http://backend:3000
const target = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': target,
      '/uploads': target,
      '/socket.io': { target, ws: true }
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js'
  }
});
