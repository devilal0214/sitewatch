import { checkUptime } from '../../monitoring/uptimeChecker';
import axios from 'axios';

// Mock axios to avoid real HTTP calls in tests
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock prisma client
jest.mock('../../lib/prisma', () => ({
  prisma: {
    website: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    uptimeLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

// Mock incident manager
jest.mock('../../monitoring/incidentManager', () => ({
  incidentManager: {
    createWebsiteDownIncident: jest.fn(),
    resolveWebsiteIncidents: jest.fn(),
    createSlowResponseIncident: jest.fn(),
  },
}));

import { prisma } from '../../lib/prisma';
import { incidentManager } from '../../monitoring/incidentManager';

const mockWebsite = {
  id: 'test-website-id',
  name: 'Test Site',
  url: 'https://example.com',
  status: 'UP',
  checkInterval: 5,
  checkTimeout: 10000,
  userId: 'user-1',
  uptimePercentage: 99.9,
};

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.website.findUnique as jest.Mock).mockResolvedValue(mockWebsite);
  (prisma.website.update as jest.Mock).mockResolvedValue({ ...mockWebsite, lastCheckedAt: new Date() });
  (prisma.uptimeLog.create as jest.Mock).mockResolvedValue({ id: 'log-1' });
  (prisma.uptimeLog.findMany as jest.Mock).mockResolvedValue([]);
});

describe('uptimeChecker', () => {
  it('records UP status on 200 response', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'text/html' },
    }) as any;

    // We call checkUptime with a pre-loaded website object to skip DB lookup
    // actual implementation takes websiteId; here we test internal performCheck logic
    const { performCheck } = require('../../monitoring/uptimeChecker');
    const result = await performCheck('https://example.com', 10000);

    expect(result.status).toBe('UP');
    expect(result.responseTime).toBeGreaterThanOrEqual(0);
    expect(result.statusCode).toBe(200);
  });

  it('records DOWN status on non-2xx response', async () => {
    mockedAxios.get = jest.fn().mockResolvedValue({
      status: 503,
      headers: {},
    }) as any;

    const { performCheck } = require('../../monitoring/uptimeChecker');
    const result = await performCheck('https://example.com', 10000);

    expect(result.status).toBe('DOWN');
    expect(result.statusCode).toBe(503);
  });

  it('records DOWN with DNS error type on ENOTFOUND', async () => {
    const dnsError = new Error('getaddrinfo ENOTFOUND example.com') as any;
    dnsError.code = 'ENOTFOUND';
    mockedAxios.get = jest.fn().mockRejectedValue(dnsError) as any;

    const { performCheck } = require('../../monitoring/uptimeChecker');
    const result = await performCheck('https://example.com', 10000);

    expect(result.status).toBe('DOWN');
    expect(result.errorType).toBe('DNS_ERROR');
  });

  it('records DOWN with timeout error type on ECONNABORTED', async () => {
    const timeoutError = new Error('timeout of 10000ms exceeded') as any;
    timeoutError.code = 'ECONNABORTED';
    mockedAxios.get = jest.fn().mockRejectedValue(timeoutError) as any;

    const { performCheck } = require('../../monitoring/uptimeChecker');
    const result = await performCheck('https://example.com', 10000);

    expect(result.status).toBe('DOWN');
    expect(result.errorType).toBe('TIMEOUT');
  });
});
