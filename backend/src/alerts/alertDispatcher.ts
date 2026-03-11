import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { sendEmailAlert } from './emailAlert';
import { sendSlackAlert } from './slackAlert';
import { sendTelegramAlert } from './telegramAlert';
import { sendWebhookAlert } from './webhookAlert';

export async function dispatchAlerts(incidentId: string, userId: string): Promise<void> {
  const [incident, alertRules] = await Promise.all([
    prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        website: { select: { name: true, url: true } },
        server: { select: { name: true, host: true } },
      },
    }),
    prisma.alertRule.findMany({
      where: { userId, isActive: true },
    }),
  ]);

  if (!incident) return;

  for (const rule of alertRules) {
    // Check if this rule should trigger for this incident type
    const shouldAlert = shouldTriggerRule(incident.type as string, rule);
    if (!shouldAlert) continue;

    let success = false;
    let errorMessage: string | undefined;

    try {
      const config = rule.config as Record<string, string>;
      const message = formatAlertMessage(incident);

      switch (rule.channel) {
        case 'email':
          await sendEmailAlert(config.email, message, incident);
          break;
        case 'slack':
          await sendSlackAlert(config.webhookUrl || config.slackWebhook, message, incident);
          break;
        case 'telegram':
          await sendTelegramAlert(config.chatId || config.telegramChatId, message);
          break;
        case 'webhook':
          await sendWebhookAlert(config.url || config.webhookUrl, incident, message);
          break;
        case 'whatsapp':
          // WhatsApp via Twilio - import dynamically if configured
          const { sendWhatsAppAlert } = await import('./whatsappAlert');
          await sendWhatsAppAlert(config.phone || config.whatsappNumber, message);
          break;
      }

      success = true;
    } catch (err: any) {
      errorMessage = err.message;
      logger.warn('Alert dispatch failed', { incidentId, channel: rule.channel, error: err.message });
    }

    await prisma.alertLog.create({
      data: {
        incidentId,
        alertRuleId: rule.id,
        channel: rule.channel,
        recipient: getRecipient(rule.config as Record<string, string>, rule.channel),
        message: formatAlertMessage(incident).text,
        success,
        errorMessage,
      },
    });
  }
}

function shouldTriggerRule(incidentType: string, rule: any): boolean {
  const typeMap: Record<string, string> = {
    website_down: 'notifyOnDown',
    slow_response: 'notifyOnDown',
    ssl_expiring: 'notifyOnSSL',
    ssl_expired: 'notifyOnSSL',
    domain_expiring: 'notifyOnDomain',
    domain_expired: 'notifyOnDomain',
    server_overload: 'notifyOnServer',
    container_stopped: 'notifyOnServer',
    container_restarting: 'notifyOnServer',
    wordpress_vulnerability: 'notifyOnDown',
    wordpress_outdated: 'notifyOnDown',
  };

  const ruleKey = typeMap[incidentType];
  return ruleKey ? rule[ruleKey] : true;
}

export function formatAlertMessage(incident: any): { text: string; title: string; emoji: string } {
  const severityEmoji: Record<string, string> = {
    critical: '🔴',
    warning: '🟡',
    info: '🔵',
  };

  const emoji = severityEmoji[incident.severity] || '⚠️';
  const site = incident.website ? `\nSite: ${incident.website.name} (${incident.website.url})` : '';
  const server = incident.server ? `\nServer: ${incident.server.name} (${incident.server.host})` : '';

  const text = `${emoji} JV SiteWatch Alert\n\n${incident.title}\n${incident.description || ''}${site}${server}\n\nSeverity: ${incident.severity.toUpperCase()}\nTime: ${incident.createdAt?.toISOString() || new Date().toISOString()}`;

  return { text, title: incident.title, emoji };
}

function getRecipient(cfg: Record<string, string>, channel: string): string {
  const keys: Record<string, string> = {
    email: 'email',
    slack: 'webhookUrl',
    telegram: 'chatId',
    whatsapp: 'phone',
    webhook: 'url',
  };
  return cfg[keys[channel]] || 'unknown';
}
