import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { addServerCheckJob } from '../../queues/queueManager';

const router = Router();
router.use(authenticate);

const createServerSchema = z.object({
  name: z.string().min(1).max(255),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).optional().default(22),
  username: z.string().min(1),
  sshPassword: z.string().optional().nullable(),
  sshKeyPath: z.string().optional().nullable(),
});

// GET /api/servers
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const servers = await prisma.server.findMany({
      where: { userId: req.user!.id, isActive: true },
      include: {
        _count: { select: { containers: true, serverMetrics: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Mask SSH password in response
    const masked = servers.map((s) => ({ ...s, sshPassword: s.sshPassword ? '***' : null }));
    res.json(masked);
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const server = await prisma.server.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: {
        containers: { where: { isActive: true } },
        _count: { select: { serverMetrics: true } },
      },
    });
    if (!server) throw new AppError(404, 'Server not found');
    res.json({ ...server, sshPassword: server.sshPassword ? '***' : null });
  } catch (err) {
    next(err);
  }
});

// POST /api/servers
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = createServerSchema.parse(req.body);
    if (!body.sshPassword && !body.sshKeyPath) {
      throw new AppError(400, 'Either SSH password or key path is required');
    }

    const server = await prisma.server.create({
      data: { ...body, userId: req.user!.id },
    });

    await addServerCheckJob(server.id);

    res.status(201).json({ ...server, sshPassword: server.sshPassword ? '***' : null });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/servers/:id
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.server.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!existing) throw new AppError(404, 'Server not found');

    const data = createServerSchema.partial().parse(req.body);
    const server = await prisma.server.update({ where: { id: req.params.id }, data });
    res.json({ ...server, sshPassword: server.sshPassword ? '***' : null });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/servers/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const server = await prisma.server.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!server) throw new AppError(404, 'Server not found');

    await prisma.server.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Server removed' });
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/metrics
router.get('/:id/metrics', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const server = await prisma.server.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!server) throw new AppError(404, 'Server not found');

    const { period = '1h' } = req.query as { period?: string };
    const periodMap: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
    const hours = periodMap[period] || 1;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const metrics = await prisma.serverMetric.findMany({
      where: { serverId: req.params.id, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      take: 500,
    });

    res.json(metrics);
  } catch (err) {
    next(err);
  }
});

// GET /api/servers/:id/containers
router.get('/:id/containers', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const server = await prisma.server.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
    if (!server) throw new AppError(404, 'Server not found');

    const containers = await prisma.container.findMany({
      where: { serverId: req.params.id, isActive: true },
      orderBy: { name: 'asc' },
    });

    res.json(containers);
  } catch (err) {
    next(err);
  }
});

export default router;
