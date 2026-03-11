import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { config } from '../config';
import { logger } from '../utils/logger';

const redisConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  maxRetriesPerRequest: null,
};

// ─── Queues ───────────────────────────────────────────────────────────────────

export const uptimeQueue = new Queue('uptime_checks', {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 },
});

export const sslQueue = new Queue('ssl_checks', {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 5000 }, removeOnComplete: 50, removeOnFail: 200 },
});

export const domainQueue = new Queue('domain_checks', {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 10000 }, removeOnComplete: 50, removeOnFail: 200 },
});

export const serverQueue = new Queue('server_checks', {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 50, removeOnFail: 200 },
});

export const containerQueue = new Queue('container_checks', {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, removeOnComplete: 50, removeOnFail: 200 },
});

export const alertQueue = new Queue('alert_dispatch', {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 200, removeOnFail: 500 },
});

export const reportQueue = new Queue('report_generation', {
  connection: redisConnection,
  defaultJobOptions: { attempts: 2, backoff: { type: 'fixed', delay: 5000 }, removeOnComplete: 100, removeOnFail: 200 },
});

// ─── Job adders ───────────────────────────────────────────────────────────────

export async function addUptimeCheckJob(websiteId: string, immediate = false): Promise<void> {
  await uptimeQueue.add('check', { websiteId }, { delay: immediate ? 0 : undefined });
}

export async function addSSLCheckJob(websiteId: string): Promise<void> {
  await sslQueue.add('check', { websiteId });
}

export async function addDomainCheckJob(websiteId: string): Promise<void> {
  await domainQueue.add('check', { websiteId });
}

export async function addServerCheckJob(serverId: string): Promise<void> {
  await serverQueue.add('check', { serverId });
}

export async function addContainerCheckJob(serverId: string): Promise<void> {
  await containerQueue.add('check', { serverId });
}

export async function addAlertJob(incidentId: string, userId: string): Promise<void> {
  await alertQueue.add('dispatch', { incidentId, userId });
}

export async function addReportJob(reportId: string): Promise<void> {
  await reportQueue.add('generate', { reportId });
}

// ─── Queue stats ──────────────────────────────────────────────────────────────

export async function getQueueStats() {
  const queues = [uptimeQueue, sslQueue, domainQueue, serverQueue, containerQueue, alertQueue, reportQueue];
  const stats: Record<string, any> = {};

  for (const q of queues) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      q.getWaitingCount(),
      q.getActiveCount(),
      q.getCompletedCount(),
      q.getFailedCount(),
      q.getDelayedCount(),
    ]);
    stats[q.name] = { waiting, active, completed, failed, delayed };
  }

  return stats;
}

// ─── Init workers ─────────────────────────────────────────────────────────────

export async function initQueues(): Promise<void> {
  logger.info('Initializing BullMQ queues and workers...');

  // Lazy-import workers to avoid circular deps
  const { createUptimeWorker } = await import('../workers/uptimeWorker');
  const { createSSLWorker } = await import('../workers/sslWorker');
  const { createDomainWorker } = await import('../workers/domainWorker');
  const { createServerWorker } = await import('../workers/serverWorker');
  const { createContainerWorker } = await import('../workers/containerWorker');
  const { createAlertWorker } = await import('../workers/alertWorker');
  const { createReportWorker } = await import('../workers/reportWorker');

  createUptimeWorker(redisConnection);
  createSSLWorker(redisConnection);
  createDomainWorker(redisConnection);
  createServerWorker(redisConnection);
  createContainerWorker(redisConnection);
  createAlertWorker(redisConnection);
  createReportWorker(redisConnection);

  logger.info('BullMQ workers started');
}
