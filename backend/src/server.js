import app from './app.js';
import { config, assertConfig } from './config/env.js';
import { connectDb } from './config/db.js';
import { pool } from './config/postgres.js';

assertConfig();
await connectDb(config.mongoUri);
await pool.query('SELECT 1'); // échoue tout de suite, avec un message clair, si PostgreSQL est injoignable

app.listen(config.port, () => {
  console.log(`API disponible sur http://localhost:${config.port}`);
});
