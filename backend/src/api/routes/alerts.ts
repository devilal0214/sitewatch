import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const alertRuleSchema = z.object({
  name: z.string().min(1).max(100),
  channel: z.enum(['email', 'slack', 'telegram', 'whatsapp', 'webhook']),
  config: z.record(z.string()),
  notifyOnDown: z.boolean().optional().default(true),
  notifyOnRecover: z.boolean().optional().default(true),
  notifyOnSSL: z.boolean().optional().default(true),
  notifyOnDomain: z.boolean().optional().default(true),
  notifyOnBackup: z.boolean().optional().default(true),
  notifyOnServer: z.boolean().optional().default(true),
});

// GET /api/alerts
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rules = await prisma.alertRule.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rules);
  } catch (err) {
    next(err);
  }
});

// POST /api/alerts
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = alertRuleSchema.parse(req.body);
    const rule = await prisma.alertRule.create({
      data: { ...body, userId: req.user!.id },
    });
    res.status(201).json(rule);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/alerts/:id
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.alertRule.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw new AppError(404, 'Alert rule not found');

    const data = alertRuleSchema.partial().parse(req.body);
    const rule = await prisma.alertRule.update({ where: { id: req.params.id }, data });
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.alertRule.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw new AppError(404, 'Alert rule not found');

    await prisma.alertRule.delete({ where: { id: req.params.id } });
    res.json({ message: 'Alert rule deleted' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/alerts/:id/toggle
router.patch('/:id/toggle', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.alertRule.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw new AppError(404, 'Alert rule not found');

    const rule = await prisma.alertRule.update({
      where: { id: req.params.id },
      data: { isActive: !existing.isActive },
    });
    res.json(rule);
  } catch (err) {
    next(err);
  }
});

// GET /api/alerts/logs
router.get('/logs', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const logs = await prisma.alertLog.findMany({
      where: { alertRule: { userId: req.user!.id } },
      include: { incident: { select: { type: true, title: true } } },
      orderBy: { sentAt: 'desc' },
      take: 100,
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});

export default router;
