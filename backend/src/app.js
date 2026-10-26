import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env.js';
import { authRouter } from './routes/authRoutes.js';
import { categoryRouter } from './routes/categoryRoutes.js';
import { adRouter } from './routes/adRoutes.js';
import { favoriteRouter } from './routes/favoriteRoutes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // les photos peuvent être affichées par le frontend
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

// Photos d'annonces : les noms de fichiers sont des UUID uniques, donc cache long et immuable
app.use('/uploads', express.static(config.uploadDir, { maxAge: '7d', immutable: true }));

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/categories', categoryRouter);
app.use('/api/ads', adRouter);
app.use('/api/favorites', favoriteRouter);
// À ajouter au fil des phases : /api/conversations, /api/users, /api/reviews, /api/reports… (voir le contrat d'API)

app.use(errorHandler); // toujours en dernier

export default app;
