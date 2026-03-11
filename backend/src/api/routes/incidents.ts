import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// GET /api/incidents
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, type, websiteId, page = '1', limit = '20' } = req.query as Record<string, string>;

    const where: any = { userId: req.user!.id };
    if (status) where.status = status;
    if (type) where.type = type;
    if (websiteId) where.websiteId = websiteId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include: {
          website: { select: { id: true, name: true, url: true } },
          server: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.incident.count({ where }),
    ]);

    res.json({
      incidents,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/incidents/:id
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const incident = await prisma.incident.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: {
        website: true,
        server: { select: { id: true, name: true } },
        alertLogs: { orderBy: { sentAt: 'desc' } },
      },
    });
    if (!incident) throw new AppError(404, 'Incident not found');
    res.json(incident);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/incidents/:id/acknowledge
router.patch('/:id/acknowledge', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const incident = await prisma.incident.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!incident) throw new AppError(404, 'Incident not found');
    if (incident.status !== 'open') throw new AppError(400, 'Incident is not open');

    const updated = await prisma.incident.update({
      where: { id: req.params.id },
      data: { status: 'acknowledged', acknowledgedAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/incidents/:id/resolve
router.patch('/:id/resolve', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const incident = await prisma.incident.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!incident) throw new AppError(404, 'Incident not found');

    const updated = await prisma.incident.update({
      where: { id: req.params.id },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/incidents/stats/summary
router.get('/stats/summary', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const [open, acknowledged, resolved, byType] = await Promise.all([
      prisma.incident.count({ where: { userId: req.user!.id, status: 'open' } }),
      prisma.incident.count({ where: { userId: req.user!.id, status: 'acknowledged' } }),
      prisma.incident.count({ where: { userId: req.user!.id, status: 'resolved' } }),
      prisma.incident.groupBy({
        by: ['type'],
        where: { userId: req.user!.id },
        _count: { type: true },
      }),
    ]);
    res.json({ open, acknowledged, resolved, byType });
  } catch (err) {
    next(err);
  }
});

export default router;
