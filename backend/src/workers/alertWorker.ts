import { Worker, Job } from 'bullmq';
import { dispatchAlerts } from '../alerts/alertDispatcher';
import { logger } from '../utils/logger';

export function createAlertWorker(redisConnection: any) {
  const worker = new Worker(
    'alert_dispatch',
    async (job: Job) => {
      const { incidentId, userId } = job.data;
      logger.debug('Processing alert dispatch', { incidentId, jobId: job.id });
      await dispatchAlerts(incidentId, userId);
    },
    { connection: redisConnection, concurrency: 20 },
  );

  worker.on('failed', (job, err) => {
    logger.error('Alert dispatch job failed', { jobId: job?.id, error: err.message });
  });

  return worker;
}
