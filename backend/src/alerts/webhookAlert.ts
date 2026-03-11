import axios from 'axios';
import { logger } from '../utils/logger';

export async function sendWebhookAlert(url: string, incident: any, message: any): Promise<void> {
  const payload = {
    event: 'incident',
    severity: incident.severity,
    type: incident.type,
    title: incident.title,
    description: incident.description,
    website: incident.website || null,
    server: incident.server || null,
    incidentId: incident.id,
    timestamp: new Date().toISOString(),
    message: message.text,
  };

  await axios.post(url, payload, {
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'JV-SiteWatch/1.0',
      'X-SiteWatch-Event': 'incident',
    },
  });

  logger.info('Webhook alert sent', { url, incidentId: incident.id });
}
