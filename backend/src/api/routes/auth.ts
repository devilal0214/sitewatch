import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createStrictRateLimiter } from '../middleware/rateLimiter';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../../utils/logger';

const router = Router();
const strictLimit = createStrictRateLimiter();

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function generateTokens(user: { id: string; email: string; role: string; name: string }) {
  const payload = { id: user.id, email: user.email, role: user.role, name: user.name };

  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as any,
  });

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as any,
  });

  return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post('/register', strictLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new AppError(409, 'Email already registered');
    }

    const hashedPassword = await bcrypt.hash(body.password, 12);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        password: hashedPassword,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    const { accessToken, refreshToken } = generateTokens(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt },
    });

    logger.info('User registered', { userId: user.id, email: user.email });

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', strictLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || !user.isActive) {
      throw new AppError(401, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(body.password, user.password);
    if (!valid) {
      throw new AppError(401, 'Invalid credentials');
    }

    const { accessToken, refreshToken } = generateTokens(user);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt },
    });

    logger.info('User logged in', { userId: user.id });

    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError(400, 'Refresh token required');

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: true } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'Invalid or expired refresh token');
    }

    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as { id: string };
    const user = stored.user;

    if (user.id !== decoded.id) throw new AppError(401, 'Token mismatch');

    const tokens = generateTokens(user);

    await prisma.refreshToken.delete({ where: { token: refreshToken } });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    await prisma.refreshToken.create({ data: { token: tokens.refreshToken, userId: user.id, expiresAt } });

    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken, userId: req.user!.id } });
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, email: true, name: true, role: true, avatar: true,
        timezone: true, agencyName: true, agencyLogo: true, agencyWebsite: true,
        agencyEmail: true, agencyPhone: true, agencyAddress: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw new AppError(404, 'User not found');
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/profile
router.put('/profile', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      name: z.string().min(2).max(100).optional(),
      timezone: z.string().optional(),
      agencyName: z.string().optional(),
      agencyLogo: z.string().url().optional().nullable(),
      agencyWebsite: z.string().url().optional().nullable(),
      agencyEmail: z.string().email().optional().nullable(),
      agencyPhone: z.string().optional().nullable(),
      agencyAddress: z.string().optional().nullable(),
    });

    const data = schema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data,
      select: { id: true, email: true, name: true, role: true, agencyName: true, updatedAt: true },
    });

    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, strictLimit, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    });

    const { currentPassword, newPassword } = schema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, 'User not found');

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new AppError(400, 'Current password is incorrect');

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    // Revoke all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
