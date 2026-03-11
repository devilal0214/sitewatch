import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import { config } from './config';
import { logger } from './utils/logger';
import { connectDatabase } from './lib/prisma';
import { initQueues } from './queues/queueManager';
import { startSchedulers } from './schedulers';

import authRoutes from './api/routes/auth';
import websiteRoutes from './api/routes/websites';
import serverRoutes from './api/routes/servers';
import incidentRoutes from './api/routes/incidents';
import alertRoutes from './api/routes/alerts';
import statusRoutes from './api/routes/status';
import adminRoutes from './api/routes/admin';
import reportRoutes from './api/routes/reports';
import { errorHandler } from './api/middleware/errorHandler';
import { createRateLimiter } from './api/middleware/rateLimiter';

const app = express();

// ── Security middleware ────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(createRateLimiter());

// ── General middleware ─────────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HTTP logging ───────────────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (req) => req.url === '/health',
  }),
);

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: config.app.name,
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/websites', websiteRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);

// ── Error handling ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  try {
    await connectDatabase();
    await initQueues();
    await startSchedulers();

    app.listen(config.app.port, () => {
      logger.info(`${config.app.name} started`, {
        port: config.app.port,
        env: config.app.env,
      });
    });
  } catch (err) {
    logger.error('Failed to start application', { error: err });
    process.exit(1);
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason });
});

bootstrap();

export default app;
