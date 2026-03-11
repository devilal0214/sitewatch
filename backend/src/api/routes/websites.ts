import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { addUptimeCheckJob, addSSLCheckJob, addDomainCheckJob } from '../../queues/queueManager';

const router = Router();
router.use(authenticate);

const createWebsiteSchema = z.object({
  name: z.string().min(1).max(255),
  url: z.string().url(),
  checkInterval: z.number().int().min(30).max(86400).optional().default(60),
  timeout: z.number().int().min(5).max(120).optional().default(30),
  monitorSSL: z.boolean().optional().default(true),
  monitorDomain: z.boolean().optional().default(true),
  monitorBackup: z.boolean().optional().default(false),
  monitorWordPress: z.boolean().optional().default(false),
  monitorPerformance: z.boolean().optional().default(false),
  backupStatusUrl: z.string().url().optional().nullable(),
  statusPageEnabled: z.boolean().optional().default(false),
  statusPageSlug: z.string().regex(/^[a-z0-9-]+$/).optional().nullable(),
});

// GET /api/websites
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const websites = await prisma.website.findMany({
      where: { userId: req.user!.id, isActive: true },
      include: {
        sslRecord: { select: { daysRemaining: true, isValid: true, validTo: true } },
        domainRecord: { select: { daysRemaining: true, expiryDate: true } },
        _count: { select: { incidents: { where: { status: { not: 'resolved' } } } },},
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(websites);
  } catch (err) {
    next(err);
  }
});

// GET /api/websites/:id
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const website = await prisma.website.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: {
        sslRecord: true,
        domainRecord: true,
        wordpressData: true,
        _count: { select: { incidents: true, uptimeLogs: true } },
      },
    });
    if (!website) throw new AppError(404, 'Website not found');
    res.json(website);
  } catch (err) {
    next(err);
  }
});

// POST /api/websites
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = createWebsiteSchema.parse(req.body);

    if (body.statusPageSlug) {
      const slugTaken = await prisma.website.findUnique({ where: { statusPageSlug: body.statusPageSlug } });
      if (slugTaken) throw new AppError(409, 'Status page slug already taken');
    }

    const website = await prisma.website.create({
      data: { ...body, userId: req.user!.id },
    });

    // Queue initial checks
    await addUptimeCheckJob(website.id);
    if (body.monitorSSL) await addSSLCheckJob(website.id);
    if (body.monitorDomain) await addDomainCheckJob(website.id);

    res.status(201).json(website);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/websites/:id
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.website.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw new AppError(404, 'Website not found');

    const updateSchema = createWebsiteSchema.partial();
    const data = updateSchema.parse(req.body);

    const website = await prisma.website.update({ where: { id: req.params.id }, data });
    res.json(website);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/websites/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const website = await prisma.website.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!website) throw new AppError(404, 'Website not found');

    await prisma.website.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Website removed' });
  } catch (err) {
    next(err);
  }
});

// GET /api/websites/:id/uptime
router.get('/:id/uptime', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const website = await prisma.website.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!website) throw new AppError(404, 'Website not found');

    const { period = '24h' } = req.query as { period?: string };
    const periodMap: Record<string, number> = { '1h': 1, '24h': 24, '7d': 168, '30d': 720 };
    const hours = periodMap[period] || 24;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const logs = await prisma.uptimeLog.findMany({
      where: { websiteId: req.params.id, checkedAt: { gte: since } },
      orderBy: { checkedAt: 'asc' },
      take: 1000,
    });

    const total = logs.length;
    const successful = logs.filter((l) => l.status === 'success').length;
    const uptimePercent = total > 0 ? (successful / total) * 100 : 100;

    const avgResponseTime =
      logs.filter((l) => l.responseTime).reduce((acc, l) => acc + (l.responseTime || 0), 0) /
      (logs.filter((l) => l.responseTime).length || 1);

    res.json({
      uptimePercent: parseFloat(uptimePercent.toFixed(3)),
      avgResponseTime: Math.round(avgResponseTime),
      total,
      successful,
      failed: total - successful,
      logs,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/websites/:id/performance
router.get('/:id/performance', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const website = await prisma.website.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!website) throw new AppError(404, 'Website not found');

    const logs = await prisma.performanceLog.findMany({
      where: { websiteId: req.params.id },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    res.json(logs);
  } catch (err) {
    next(err);
  }
});

// POST /api/websites/:id/trigger-check
router.post('/:id/trigger-check', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const website = await prisma.website.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!website) throw new AppError(404, 'Website not found');

    await addUptimeCheckJob(req.params.id, true);
    res.json({ message: 'Check queued successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
