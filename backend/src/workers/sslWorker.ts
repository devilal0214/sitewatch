import { Worker, Job } from 'bullmq';
import { checkSSL } from '../monitoring/sslChecker';
import { logger } from '../utils/logger';

export function createSSLWorker(redisConnection: any) {
  const worker = new Worker(
    'ssl_checks',
    async (job: Job) => {
      const { websiteId } = job.data;
      logger.debug('Processing SSL check', { websiteId, jobId: job.id });
      await checkSSL(websiteId);
    },
    { connection: redisConnection, concurrency: 20 },
  );

  worker.on('failed', (job, err) => {
    logger.error('SSL check job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}
