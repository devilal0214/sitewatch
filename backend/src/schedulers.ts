import cron from 'node-cron';
import { prisma } from './lib/prisma';
import { logger } from './utils/logger';
import {
  addUptimeCheckJob,
  addSSLCheckJob,
  addDomainCheckJob,
  addServerCheckJob,
  addContainerCheckJob,
  addReportJob,
} from './queues/queueManager';
import { config } from './config';

export async function startSchedulers(): Promise<void> {
  logger.info('Starting schedulers...');

  // ── Uptime checks every minute ─────────────────────────────────────────────
  cron.schedule('* * * * *', async () => {
    try {
      const websites = await prisma.website.findMany({
        where: { isActive: true },
        select: { id: true, checkInterval: true, lastCheckedAt: true },
      });

      const now = new Date();
      for (const site of websites) {
        const intervalMs = site.checkInterval * 1000;
        const shouldCheck = !site.lastCheckedAt || (now.getTime() - site.lastCheckedAt.getTime()) >= intervalMs;
        if (shouldCheck) {
          await addUptimeCheckJob(site.id);
        }
      }
    } catch (err: any) {
      logger.error('Uptime scheduler error', { error: err.message });
    }
  });

  // ── SSL checks every hour ─────────────────────────────────────────────────
  cron.schedule('0 * * * *', async () => {
    try {
      const websites = await prisma.website.findMany({
        where: { isActive: true, monitorSSL: true },
        select: { id: true },
      });

      for (const site of websites) {
        await addSSLCheckJob(site.id);
      }
      logger.info(`SSL checks scheduled for ${websites.length} websites`);
    } catch (err: any) {
      logger.error('SSL scheduler error', { error: err.message });
    }
  });

  // ── Domain checks every 6 hours ───────────────────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    try {
      const websites = await prisma.website.findMany({
        where: { isActive: true, monitorDomain: true },
        select: { id: true },
      });

      for (const site of websites) {
        await addDomainCheckJob(site.id);
      }
      logger.info(`Domain checks scheduled for ${websites.length} websites`);
    } catch (err: any) {
      logger.error('Domain scheduler error', { error: err.message });
    }
  });

  // ── Server & container checks every minute ─────────────────────────────────
  cron.schedule('* * * * *', async () => {
    try {
      const servers = await prisma.server.findMany({
        where: { isActive: true },
        select: { id: true },
      });

      for (const server of servers) {
        await addServerCheckJob(server.id);
        await addContainerCheckJob(server.id);
      }
    } catch (err: any) {
      logger.error('Server scheduler error', { error: err.message });
    }
  });

  // ── Monthly reports ────────────────────────────────────────────────────────
  cron.schedule(config.reports.scheduleCron, async () => {
    try {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        include: { websites: { where: { isActive: true }, select: { id: true } } },
      });

      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

      for (const user of users) {
        for (const website of user.websites) {
          const report = await prisma.report.create({
            data: {
              userId: user.id,
              websiteId: website.id,
              type: 'monthly_health',
              title: `Monthly Health Report - ${periodStart.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
              periodStart,
              periodEnd,
              status: 'pending',
            },
          });
          await addReportJob(report.id);
        }
      }

      logger.info('Monthly reports scheduled');
    } catch (err: any) {
      logger.error('Monthly report scheduler error', { error: err.message });
    }
  });

  // ── Cleanup old logs (daily at 3am) ───────────────────────────────────────
  cron.schedule('0 3 * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const [deletedUptime, deletedMetrics, deletedPerf] = await Promise.all([
        prisma.uptimeLog.deleteMany({ where: { checkedAt: { lt: cutoff } } }),
        prisma.serverMetric.deleteMany({ where: { recordedAt: { lt: cutoff } } }),
        prisma.performanceLog.deleteMany({ where: { recordedAt: { lt: cutoff } } }),
      ]);

      logger.info('Old logs cleaned up', {
        uptimeLogs: deletedUptime.count,
        serverMetrics: deletedMetrics.count,
        performanceLogs: deletedPerf.count,
      });
    } catch (err: any) {
      logger.error('Log cleanup error', { error: err.message });
    }
  });

  logger.info('All schedulers started');
}
