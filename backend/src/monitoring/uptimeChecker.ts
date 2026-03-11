import axios, { AxiosResponse } from 'axios';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { incidentManager } from './incidentManager';
import { config } from '../config';

interface UptimeResult {
  status: 'success' | 'failure' | 'timeout' | 'dns_error' | 'ssl_error';
  statusCode?: number;
  responseTime?: number;
  errorMessage?: string;
  dnsResolved: boolean;
}

export async function checkUptime(websiteId: string): Promise<void> {
  const website = await prisma.website.findUnique({ where: { id: websiteId } });
  if (!website || !website.isActive) return;

  const result = await performCheck(website.url, website.timeout * 1000);

  await prisma.uptimeLog.create({
    data: {
      websiteId,
      status: result.status,
      statusCode: result.statusCode,
      responseTime: result.responseTime,
      errorMessage: result.errorMessage,
      dnsResolved: result.dnsResolved,
    },
  });

  const isDown = result.status !== 'success';
  const previousStatus = website.status;

  // Update website status
  await prisma.website.update({
    where: { id: websiteId },
    data: {
      status: isDown ? 'DOWN' : 'UP',
      lastCheckedAt: new Date(),
      lastStatusCode: result.statusCode,
      lastResponseTime: result.responseTime,
    },
  });

  // Recalculate uptime percentage (last 24h)
  await updateUptimePercentage(websiteId);

  if (isDown && previousStatus !== 'DOWN') {
    await incidentManager.createWebsiteDownIncident(website, result);
    logger.warn('Website down detected', { websiteId, url: website.url, error: result.errorMessage });
  } else if (!isDown && previousStatus === 'DOWN') {
    await incidentManager.resolveWebsiteIncidents(website);
    logger.info('Website recovered', { websiteId, url: website.url });
  }

  // Slow response check
  if (result.responseTime && result.responseTime > config.thresholds.responseTimeWarningMs) {
    await incidentManager.createSlowResponseIncident(website, result.responseTime);
  }
}

async function performCheck(url: string, timeoutMs: number): Promise<UptimeResult> {
  const startTime = Date.now();

  try {
    const response: AxiosResponse = await axios.get(url, {
      timeout: timeoutMs,
      maxRedirects: 10,
      validateStatus: () => true, // Accept all status codes
      headers: {
        'User-Agent': 'JV-SiteWatch/1.0 UptimeMonitor',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    const responseTime = Date.now() - startTime;
    const isSuccess = response.status >= 200 && response.status < 400;

    return {
      status: isSuccess ? 'success' : 'failure',
      statusCode: response.status,
      responseTime,
      dnsResolved: true,
      errorMessage: isSuccess ? undefined : `HTTP ${response.status}`,
    };
  } catch (err: any) {
    const responseTime = Date.now() - startTime;

    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return { status: 'timeout', responseTime, dnsResolved: true, errorMessage: 'Connection timed out' };
    }

    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return { status: 'dns_error', responseTime, dnsResolved: false, errorMessage: `DNS resolution failed: ${err.message}` };
    }

    if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
      return { status: 'ssl_error', responseTime, dnsResolved: true, errorMessage: `SSL error: ${err.message}` };
    }

    return {
      status: 'failure',
      responseTime,
      dnsResolved: true,
      errorMessage: err.message || 'Unknown error',
    };
  }
}

async function updateUptimePercentage(websiteId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const logs = await prisma.uptimeLog.findMany({
    where: { websiteId, checkedAt: { gte: since } },
    select: { status: true },
  });

  const total = logs.length;
  if (total === 0) return;

  const successful = logs.filter((l) => l.status === 'success').length;
  const uptimePercentage = (successful / total) * 100;

  await prisma.website.update({
    where: { id: websiteId },
    data: { uptimePercentage: parseFloat(uptimePercentage.toFixed(3)) },
  });
}

export { UptimeResult };
