import { Worker, Job } from 'bullmq';
import { checkDomain } from '../monitoring/domainChecker';
import { logger } from '../utils/logger';

export function createDomainWorker(redisConnection: any) {
  const worker = new Worker(
    'domain_checks',
    async (job: Job) => {
      const { websiteId } = job.data;
      logger.debug('Processing domain check', { websiteId, jobId: job.id });
      await checkDomain(websiteId);
    },
    { connection: redisConnection, concurrency: 10 },
  );

  worker.on('failed', (job, err) => {
    logger.error('Domain check job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}
