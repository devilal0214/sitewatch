import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';

// Mock prisma
jest.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '../../lib/prisma';
import authRouter from '../../api/routes/auth';

// Build a minimal express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  password: bcrypt.hashSync('Password123!', 10),
  role: 'AGENCY',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/auth/login', () => {
  it('returns 200 and tokens on valid credentials', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ token: 'refresh-token', userId: mockUser.id });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('returns 401 on wrong password', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 when user not found', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password123!' });

    expect(res.status).toBe(401);
  });

  it('returns 400 on missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when account is disabled', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...mockUser, isActive: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123!' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/register', () => {
  it('returns 201 and tokens for a new user', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null); // no existing user
    (prisma.user.create as jest.Mock).mockResolvedValue({ ...mockUser, id: 'new-user' });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({ token: 'rt', userId: 'new-user' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New User', email: 'new@example.com', password: 'Password123!' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('returns 409 when email already in use', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test', email: 'test@example.com', password: 'Password123!' });

    expect(res.status).toBe(409);
  });
});
