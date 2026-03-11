import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { addReportJob } from '../../queues/queueManager';

const router = Router();
router.use(authenticate);

// GET /api/reports
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const reports = await prisma.report.findMany({
      where: { userId: req.user!.id },
      include: { website: { select: { id: true, name: true, url: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

// POST /api/reports/generate
router.post('/generate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      websiteId: z.string().optional(),
      type: z.enum(['monthly_health', 'wordpress_maintenance', 'incident_summary', 'performance']),
      periodStart: z.string().datetime(),
      periodEnd: z.string().datetime(),
    });

    const body = schema.parse(req.body);

    if (body.websiteId) {
      const website = await prisma.website.findFirst({ where: { id: body.websiteId, userId: req.user!.id } });
      if (!website) throw new AppError(404, 'Website not found');
    }

    const report = await prisma.report.create({
      data: {
        userId: req.user!.id,
        websiteId: body.websiteId || null,
        type: body.type,
        title: `${body.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Report`,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        status: 'pending',
      },
    });

    await addReportJob(report.id);
    res.status(202).json(report);
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/:id
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: { website: { select: { id: true, name: true, url: true } } },
    });
    if (!report) throw new AppError(404, 'Report not found');
    res.json(report);
  } catch (err) {
    next(err);
  }
});

export default router;
