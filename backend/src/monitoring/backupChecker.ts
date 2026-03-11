import axios from 'axios';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { incidentManager } from './incidentManager';
import { config } from '../config';

interface BackupStatus {
  last_backup: string;  // ISO date string
  backup_size: number;  // bytes
  status: 'ok' | 'failed' | 'running';
  message?: string;
}

export async function checkBackup(websiteId: string): Promise<void> {
  const website = await prisma.website.findUnique({ where: { id: websiteId } });
  if (!website || !website.isActive || !website.monitorBackup) return;
  if (!website.backupStatusUrl) return;

  try {
    const response = await axios.get<BackupStatus>(website.backupStatusUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'JV-SiteWatch/1.0' },
    });

    const data = response.data;
    const lastBackupAt = data.last_backup ? new Date(data.last_backup) : null;
    const backupAgeHours = lastBackupAt
      ? (Date.now() - lastBackupAt.getTime()) / (1000 * 60 * 60)
      : Infinity;

    await prisma.backupLog.create({
      data: {
        websiteId,
        lastBackupAt,
        backupSizeBytes: data.backup_size ? BigInt(data.backup_size) : null,
        status: data.status,
        checkedAt: new Date(),
      },
    });

    if (backupAgeHours > config.thresholds.backupMaxAgeHours) {
      await incidentManager.createBackupOverdueIncident(website, Math.floor(backupAgeHours));
      logger.warn('Backup overdue', { websiteId, ageHours: Math.floor(backupAgeHours) });
    }
  } catch (err: any) {
    logger.error('Backup check failed', { websiteId, url: website.backupStatusUrl, error: err.message });
    await prisma.backupLog.create({
      data: {
        websiteId,
        status: 'failed',
        errorMessage: err.message,
        checkedAt: new Date(),
      },
    });
  }
}
