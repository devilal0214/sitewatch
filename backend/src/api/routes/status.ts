import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { authenticate, AuthRequest, optionalAuth } from '../middleware/auth';

const router = Router();

// GET /api/status/:slug  — Public status page
router.get('/:slug', optionalAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const website = await prisma.website.findUnique({
      where: { statusPageSlug: req.params.slug },
      select: {
        id: true,
        name: true,
        url: true,
        status: true,
        statusPageEnabled: true,
        uptimePercentage: true,
        lastCheckedAt: true,
        sslRecord: { select: { daysRemaining: true, isValid: true } },
        domainRecord: { select: { daysRemaining: true } },
      },
    });

    if (!website || !website.statusPageEnabled) {
      throw new AppError(404, 'Status page not found');
    }

    // Recent incidents (last 90 days)
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const incidents = await prisma.incident.findMany({
      where: { websiteId: website.id, createdAt: { gte: since } },
      select: {
        id: true, type: true, title: true, status: true,
        createdAt: true, resolvedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // 30-day uptime chart
    const logs = await prisma.uptimeLog.findMany({
      where: {
        websiteId: website.id,
        checkedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { checkedAt: 'asc' },
      take: 2000,
    });

    res.json({ website, incidents, uptimeLogs: logs });
  } catch (err) {
    next(err);
  }
});

// GET /api/status/:websiteId/uptime  — Authenticated detailed uptime
router.get('/:websiteId/uptime', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const website = await prisma.website.findFirst({
      where: { id: req.params.websiteId, userId: req.user!.id },
    });
    if (!website) throw new AppError(404, 'Website not found');

    const { period = '24h' } = req.query as { period?: string };
    const periodMap: Record<string, number> = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 };
    const hours = periodMap[period] || 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await prisma.uptimeLog.findMany({
      where: { websiteId: req.params.websiteId, checkedAt: { gte: since } },
      orderBy: { checkedAt: 'asc' },
    });

    const total = logs.length;
    const up = logs.filter((l) => l.status === 'success').length;
    const uptimePercent = total > 0 ? (up / total) * 100 : 100;

    res.json({ uptimePercent: parseFloat(uptimePercent.toFixed(3)), total, up, down: total - up, logs });
  } catch (err) {
    next(err);
  }
});

export default router;
