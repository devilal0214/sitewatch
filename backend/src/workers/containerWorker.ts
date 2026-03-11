import { Worker, Job } from 'bullmq';
import { checkContainers } from '../monitoring/containerChecker';
import { logger } from '../utils/logger';

export function createContainerWorker(redisConnection: any) {
  const worker = new Worker(
    'container_checks',
    async (job: Job) => {
      const { serverId } = job.data;
      logger.debug('Processing container check', { serverId, jobId: job.id });
      await checkContainers(serverId);
    },
    { connection: redisConnection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    logger.error('Container check job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}
