import { Worker, Job } from 'bullmq';
import { checkServer } from '../monitoring/serverChecker';
import { checkContainers } from '../monitoring/containerChecker';
import { logger } from '../utils/logger';

export function createServerWorker(redisConnection: any) {
  const worker = new Worker(
    'server_checks',
    async (job: Job) => {
      const { serverId } = job.data;
      logger.debug('Processing server check', { serverId, jobId: job.id });
      await checkServer(serverId);
    },
    { connection: redisConnection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    logger.error('Server check job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}
