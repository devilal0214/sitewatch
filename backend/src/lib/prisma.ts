import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ||
  new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn' },
    ],
  });

if (process.env.NODE_ENV === 'development') {
  global.__prisma = prisma;

  // Log slow queries in dev
  (prisma as any).$on('query', (e: any) => {
    if (e.duration > 500) {
      logger.warn('Slow query detected', { query: e.query, duration: e.duration });
    }
  });
}

(prisma as any).$on('error', (e: any) => {
  logger.error('Prisma error', { message: e.message });
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
