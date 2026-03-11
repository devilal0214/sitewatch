import tls from 'tls';
import { URL } from 'url';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { incidentManager } from './incidentManager';
import { config } from '../config';

interface SSLInfo {
  issuer: string;
  subject: string;
  validFrom: Date;
  validTo: Date;
  daysRemaining: number;
  isValid: boolean;
  errorMessage?: string;
}

export async function checkSSL(websiteId: string): Promise<void> {
  const website = await prisma.website.findUnique({ where: { id: websiteId } });
  if (!website || !website.isActive) return;

  let parsed: URL;
  try {
    parsed = new URL(website.url);
  } catch {
    logger.warn('Invalid URL for SSL check', { websiteId, url: website.url });
    return;
  }

  if (parsed.protocol !== 'https:') {
    // No SSL for non-HTTPS sites
    return;
  }

  const result = await fetchSSLInfo(parsed.hostname);

  await prisma.sslRecord.upsert({
    where: { websiteId },
    create: {
      websiteId,
      ...result,
      lastCheckedAt: new Date(),
    },
    update: {
      ...result,
      lastCheckedAt: new Date(),
    },
  });

  if (!result.isValid) {
    await incidentManager.createSSLExpiredIncident(website);
    logger.warn('SSL expired or invalid', { websiteId, url: website.url });
  } else if (result.daysRemaining <= config.thresholds.sslExpiryWarningDays) {
    await incidentManager.createSSLExpiringIncident(website, result.daysRemaining);
    logger.warn('SSL expiring soon', { websiteId, daysRemaining: result.daysRemaining });
  }
}

function fetchSSLInfo(hostname: string): Promise<SSLInfo> {
  return new Promise((resolve) => {
    const socket = tls.connect(443, hostname, { servername: hostname, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate();
      socket.destroy();

      if (!cert || !cert.valid_to) {
        resolve({
          issuer: 'Unknown',
          subject: hostname,
          validFrom: new Date(),
          validTo: new Date(),
          daysRemaining: 0,
          isValid: false,
          errorMessage: 'Could not retrieve certificate',
        });
        return;
      }

      const validTo = new Date(cert.valid_to);
      const validFrom = new Date(cert.valid_from);
      const now = new Date();
      const daysRemaining = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      const issuer = cert.issuer
        ? Object.entries(cert.issuer)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')
        : 'Unknown';

      const subject = cert.subject?.CN || hostname;

      resolve({
        issuer,
        subject,
        validFrom,
        validTo,
        daysRemaining,
        isValid: daysRemaining > 0 && socket.authorized !== false,
      });
    });

    socket.setTimeout(10000);
    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        issuer: 'Unknown',
        subject: hostname,
        validFrom: new Date(),
        validTo: new Date(),
        daysRemaining: 0,
        isValid: false,
        errorMessage: 'SSL check timed out',
      });
    });

    socket.on('error', (err) => {
      resolve({
        issuer: 'Unknown',
        subject: hostname,
        validFrom: new Date(),
        validTo: new Date(),
        daysRemaining: 0,
        isValid: false,
        errorMessage: err.message,
      });
    });
  });
}
