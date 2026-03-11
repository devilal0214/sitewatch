import { Worker, Job } from 'bullmq';
import { checkUptime } from '../monitoring/uptimeChecker';
import { logger } from '../utils/logger';

export function createUptimeWorker(redisConnection: any) {
  const worker = new Worker(
    'uptime_checks',
    async (job: Job) => {
      const { websiteId } = job.data;
      logger.debug('Processing uptime check', { websiteId, jobId: job.id });
      await checkUptime(websiteId);
    },
    {
      connection: redisConnection,
      concurrency: 50,
      limiter: { max: 200, duration: 1000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error('Uptime check job failed', { jobId: job?.id, websiteId: job?.data?.websiteId, error: err.message });
  });

  return worker;
}
