import axios from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';

export async function sendSlackAlert(webhookUrl: string, message: any, incident: any): Promise<void> {
  const colorMap: Record<string, string> = {
    critical: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
  };

  const color = colorMap[incident.severity] || '#6b7280';

  const payload = {
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `${message.emoji} ${incident.title}`, emoji: true },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Severity:*\n${incident.severity.toUpperCase()}` },
              { type: 'mrkdwn', text: `*Type:*\n${incident.type.replace(/_/g, ' ')}` },
              ...(incident.website ? [{ type: 'mrkdwn', text: `*Site:*\n<${incident.website.url}|${incident.website.name}>` }] : []),
              ...(incident.server ? [{ type: 'mrkdwn', text: `*Server:*\n${incident.server.name}` }] : []),
            ],
          },
          {
            type: 'section',
            text: { type: 'mrkdwn', text: incident.description || '' },
          },
          ...(incident.aiAnalysis ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `*🤖 AI Analysis:*\n${incident.aiAnalysis}` },
          }] : []),
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View Incident' },
                url: `${config.app.url}/incidents/${incident.id}`,
                style: incident.severity === 'critical' ? 'danger' : 'primary',
              },
            ],
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `*JV SiteWatch* | ${new Date().toUTCString()}` }],
          },
        ],
      },
    ],
  };

  await axios.post(webhookUrl, payload, { timeout: 10000 });
  logger.info('Slack alert sent', { incidentId: incident.id });
}
