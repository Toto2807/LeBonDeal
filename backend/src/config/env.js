import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: process.env.DATABASE_URL,
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};

// Appelée par server.js uniquement : les tests peuvent importer app.js sans variables d'environnement.
export function assertConfig() {
  const missing = ['DATABASE_URL', 'MONGODB_URI', 'JWT_SECRET'].filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Variables d'environnement manquantes : ${missing.join(', ')}`);
  }
}
