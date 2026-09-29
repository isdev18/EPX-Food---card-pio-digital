import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { apiRouter } from './routes/api.routes.js';
import { webhookRouter } from './routes/webhook.routes.js';
import { errorHandler } from './middlewares/errors.js';
import { publicRouter } from './routes/public.routes.js';

export const app = express();
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    const configuredOrigins = env.WEB_URL.split(',').map((value) => value.trim());
    const localDevelopmentOrigin = env.NODE_ENV !== 'production'
      && Boolean(origin?.match(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/));
    if (!origin || configuredOrigins.includes(origin) || localDevelopmentOrigin) return callback(null, true);
    return callback(new Error('Origem nÃ£o permitida pelo CORS.'));
  },
}));
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buffer) => { (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); },
}));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'epx-food-api' }));
app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api', apiRouter);
app.use('/webhooks', webhookRouter);
app.use((_req, res) => res.status(404).json({ message: 'Rota não encontrada.' }));
app.use(errorHandler);
