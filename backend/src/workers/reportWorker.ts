import { Worker, Job } from 'bullmq';
import { generateReport } from '../reports/reportGenerator';
import { logger } from '../utils/logger';

export function createReportWorker(redisConnection: any) {
  const worker = new Worker(
    'report_generation',
    async (job: Job) => {
      const { reportId } = job.data;
      logger.info('Processing report generation', { reportId, jobId: job.id });
      await generateReport(reportId);
    },
    { connection: redisConnection, concurrency: 3 },
  );

  worker.on('failed', (job, err) => {
    logger.error('Report generation job failed', { jobId: job?.id, reportId: job?.data?.reportId, error: err.message });
  });

  return worker;
}
