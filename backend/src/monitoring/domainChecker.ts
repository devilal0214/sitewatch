import whois from 'whois';
import { URL } from 'url';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { incidentManager } from './incidentManager';
import { config } from '../config';

export async function checkDomain(websiteId: string): Promise<void> {
  const website = await prisma.website.findUnique({ where: { id: websiteId } });
  if (!website || !website.isActive) return;

  let domain: string;
  try {
    domain = new URL(website.url).hostname;
  } catch {
    logger.warn('Invalid URL for domain check', { websiteId });
    return;
  }

  try {
    const info = await lookupDomain(domain);

    await prisma.domainRecord.upsert({
      where: { websiteId },
      create: { websiteId, domain, ...info, lastCheckedAt: new Date() },
      update: { ...info, lastCheckedAt: new Date() },
    });

    if (info.expiryDate && info.daysRemaining !== null) {
      if (info.daysRemaining <= 0) {
        await incidentManager.createDomainExpiredIncident(website, domain);
      } else if (info.daysRemaining <= config.thresholds.domainExpiryWarningDays) {
        await incidentManager.createDomainExpiringIncident(website, domain, info.daysRemaining);
      }
    }
  } catch (err: any) {
    logger.error('Domain check failed', { websiteId, domain, error: err.message });
    await prisma.domainRecord.upsert({
      where: { websiteId },
      create: { websiteId, domain, errorMessage: err.message, lastCheckedAt: new Date() },
      update: { errorMessage: err.message, lastCheckedAt: new Date() },
    });
  }
}

function lookupDomain(domain: string): Promise<{
  registrar?: string;
  expiryDate?: Date;
  daysRemaining?: number;
  errorMessage?: string;
}> {
  return new Promise((resolve, reject) => {
    whois.lookup(domain, (err: Error | null, data: string) => {
      if (err) {
        reject(err);
        return;
      }

      const registrar = extractField(data, [
        'Registrar:',
        'Registrar Name:',
        'registrar:',
      ]);

      const expiryRaw = extractField(data, [
        'Registry Expiry Date:',
        'Expiry Date:',
        'Expiration Date:',
        'expires:',
        'Registrar Registration Expiration Date:',
        'paid-till:',
      ]);

      if (!expiryRaw) {
        resolve({ registrar, errorMessage: 'Expiry date not found in WHOIS data' });
        return;
      }

      const expiryDate = new Date(expiryRaw);
      if (isNaN(expiryDate.getTime())) {
        resolve({ registrar, errorMessage: `Could not parse expiry date: ${expiryRaw}` });
        return;
      }

      const daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      resolve({ registrar, expiryDate, daysRemaining });
    });
  });
}

function extractField(data: string, fieldNames: string[]): string | undefined {
  for (const field of fieldNames) {
    const regex = new RegExp(`${field}\\s*(.+)`, 'im');
    const match = data.match(regex);
    if (match) {
      return match[1].trim();
    }
  }
  return undefined;
}
