import { Router, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getQueueStats } from '../../queues/queueManager';

const router = Router();
router.use(authenticate, requireAdmin);

// GET /api/admin/system-health
router.get('/system-health', async (_req, res: Response, next: NextFunction) => {
  try {
    const [userCount, websiteCount, serverCount, incidentCount, queueStats] = await Promise.all([
      prisma.user.count(),
      prisma.website.count({ where: { isActive: true } }),
      prisma.server.count({ where: { isActive: true } }),
      prisma.incident.count({ where: { status: 'open' } }),
      getQueueStats(),
    ]);

    const memUsage = process.memoryUsage();

    res.json({
      users: userCount,
      websites: websiteCount,
      servers: serverCount,
      openIncidents: incidentCount,
      queues: queueStats,
      system: {
        uptime: process.uptime(),
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memUsage.rss / 1024 / 1024),
        },
        nodeVersion: process.version,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users
router.get('/users', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page = '1', limit = '20', search } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, name: true, role: true, isActive: true,
          createdAt: true,
          _count: { select: { websites: true, incidents: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ users, pagination: { page: parseInt(page), limit: parseInt(limit), total } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role, isActive } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { ...(role && { role }), ...(isActive !== undefined && { isActive }) },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/metrics
router.get('/metrics', async (_req, res: Response, next: NextFunction) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [newUsers, totalChecks, totalAlerts, incidentsByType] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.uptimeLog.count({ where: { checkedAt: { gte: thirtyDaysAgo } } }),
      prisma.alertLog.count({ where: { sentAt: { gte: thirtyDaysAgo } } }),
      prisma.incident.groupBy({
        by: ['type'],
        _count: { type: true },
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    res.json({ newUsers, totalChecks, totalAlerts, incidentsByType });
  } catch (err) {
    next(err);
  }
});

export default router;
