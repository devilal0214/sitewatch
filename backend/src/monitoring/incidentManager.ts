import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { dispatchAlerts } from '../alerts/alertDispatcher';
import { analyzeIncident } from '../ai/incidentAnalyzer';

type WebsiteBasic = { id: string; userId: string; name: string; url: string };
type ServerBasic = { id: string; userId: string; name: string; host: string };
type ContainerBasic = { id: string; name: string };

export const incidentManager = {
  async createWebsiteDownIncident(website: WebsiteBasic, result: any) {
    const existing = await prisma.incident.findFirst({
      where: { websiteId: website.id, type: 'website_down', status: { not: 'resolved' } },
    });
    if (existing) return existing;

    const incident = await prisma.incident.create({
      data: {
        userId: website.userId,
        websiteId: website.id,
        type: 'website_down',
        title: `${website.name} is DOWN`,
        description: `${website.url} returned: ${result.errorMessage || `HTTP ${result.statusCode}`}`,
        severity: 'critical',
        status: 'open',
      },
    });

    await triggerAIAnalysisAndAlerts(incident.id, website.userId);
    logger.warn('Incident created: website_down', { incidentId: incident.id });
    return incident;
  },

  async resolveWebsiteIncidents(website: WebsiteBasic) {
    await prisma.incident.updateMany({
      where: { websiteId: website.id, type: 'website_down', status: { not: 'resolved' } },
      data: { status: 'resolved', resolvedAt: new Date() },
    });
  },

  async createSlowResponseIncident(website: WebsiteBasic, responseTime: number) {
    const existing = await prisma.incident.findFirst({
      where: { websiteId: website.id, type: 'slow_response', status: { not: 'resolved' },
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: website.userId,
        websiteId: website.id,
        type: 'slow_response',
        title: `${website.name} responding slowly`,
        description: `Response time: ${responseTime}ms`,
        severity: 'warning',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, website.userId);
  },

  async createSSLExpiringIncident(website: WebsiteBasic, daysRemaining: number) {
    const existing = await prisma.incident.findFirst({
      where: { websiteId: website.id, type: 'ssl_expiring', status: { not: 'resolved' } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: website.userId,
        websiteId: website.id,
        type: 'ssl_expiring',
        title: `SSL certificate expiring in ${daysRemaining} days`,
        description: `SSL certificate for ${website.url} expires in ${daysRemaining} days`,
        severity: daysRemaining <= 7 ? 'critical' : 'warning',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, website.userId);
  },

  async createSSLExpiredIncident(website: WebsiteBasic) {
    const existing = await prisma.incident.findFirst({
      where: { websiteId: website.id, type: 'ssl_expired', status: { not: 'resolved' } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: website.userId,
        websiteId: website.id,
        type: 'ssl_expired',
        title: `SSL certificate EXPIRED for ${website.name}`,
        description: `SSL certificate for ${website.url} has expired`,
        severity: 'critical',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, website.userId);
  },

  async createDomainExpiringIncident(website: WebsiteBasic, domain: string, daysRemaining: number) {
    const existing = await prisma.incident.findFirst({
      where: { websiteId: website.id, type: 'domain_expiring', status: { not: 'resolved' } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: website.userId,
        websiteId: website.id,
        type: 'domain_expiring',
        title: `Domain ${domain} expiring in ${daysRemaining} days`,
        description: `Domain ${domain} will expire in ${daysRemaining} days. Renew immediately.`,
        severity: daysRemaining <= 7 ? 'critical' : 'warning',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, website.userId);
  },

  async createDomainExpiredIncident(website: WebsiteBasic, domain: string) {
    const existing = await prisma.incident.findFirst({
      where: { websiteId: website.id, type: 'domain_expired', status: { not: 'resolved' } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: website.userId,
        websiteId: website.id,
        type: 'domain_expired',
        title: `Domain ${domain} has EXPIRED`,
        description: `Domain ${domain} has expired. Renew immediately to restore service.`,
        severity: 'critical',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, website.userId);
  },

  async createServerOverloadIncident(server: ServerBasic, resource: string, value: number) {
    const existing = await prisma.incident.findFirst({
      where: {
        serverId: server.id, type: 'server_overload', status: { not: 'resolved' },
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: server.userId,
        serverId: server.id,
        type: 'server_overload',
        title: `High ${resource.toUpperCase()} usage on ${server.name}`,
        description: `${resource.toUpperCase()} usage at ${value.toFixed(1)}% on server ${server.name} (${server.host})`,
        severity: value > 95 ? 'critical' : 'warning',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, server.userId);
  },

  async createServerOfflineIncident(server: ServerBasic, errorMessage: string) {
    const existing = await prisma.incident.findFirst({
      where: { serverId: server.id, type: 'server_overload', status: { not: 'resolved' } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: server.userId,
        serverId: server.id,
        type: 'server_overload',
        title: `Server ${server.name} is unreachable`,
        description: `Cannot connect to server ${server.name} (${server.host}): ${errorMessage}`,
        severity: 'critical',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, server.userId);
  },

  async createContainerStoppedIncident(server: ServerBasic, container: ContainerBasic) {
    const existing = await prisma.incident.findFirst({
      where: { containerId: container.id, type: 'container_stopped', status: { not: 'resolved' } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: server.userId,
        serverId: server.id,
        containerId: container.id,
        type: 'container_stopped',
        title: `Container ${container.name} is stopped`,
        description: `Docker container ${container.name} on server ${server.name} has stopped`,
        severity: 'critical',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, server.userId);
  },

  async createContainerRestartingIncident(server: ServerBasic, container: ContainerBasic) {
    const existing = await prisma.incident.findFirst({
      where: { containerId: container.id, type: 'container_restarting', status: { not: 'resolved' } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: server.userId,
        serverId: server.id,
        containerId: container.id,
        type: 'container_restarting',
        title: `Container ${container.name} is crash-looping`,
        description: `Docker container ${container.name} on server ${server.name} is in restart loop`,
        severity: 'warning',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, server.userId);
  },

  async createBackupOverdueIncident(website: WebsiteBasic, ageHours: number) {
    const existing = await prisma.incident.findFirst({
      where: { websiteId: website.id, type: 'website_down', status: { not: 'resolved' },
        createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: website.userId,
        websiteId: website.id,
        type: 'website_down', // using closest type; can extend enum if needed
        title: `Backup overdue for ${website.name}`,
        description: `Last backup was ${ageHours} hours ago (limit: 24h)`,
        severity: 'warning',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, website.userId);
  },

  async createWordPressVulnerabilityIncident(website: WebsiteBasic, count: number) {
    const existing = await prisma.incident.findFirst({
      where: { websiteId: website.id, type: 'wordpress_vulnerability', status: { not: 'resolved' } },
    });
    if (existing) return;

    const incident = await prisma.incident.create({
      data: {
        userId: website.userId,
        websiteId: website.id,
        type: 'wordpress_vulnerability',
        title: `${count} WordPress vulnerability${count > 1 ? 'ies' : 'y'} on ${website.name}`,
        description: `Found ${count} potentially vulnerable plugins/themes on ${website.url}`,
        severity: 'warning',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, website.userId);
  },

  async createWordPressOutdatedIncident(website: WebsiteBasic, pluginCount: number, coreOutdated: boolean) {
    const existing = await prisma.incident.findFirst({
      where: { websiteId: website.id, type: 'wordpress_outdated', status: { not: 'resolved' } },
    });
    if (existing) return;

    const parts = [];
    if (coreOutdated) parts.push('WordPress core needs update');
    if (pluginCount > 0) parts.push(`${pluginCount} plugin${pluginCount > 1 ? 's need' : ' needs'} update`);

    const incident = await prisma.incident.create({
      data: {
        userId: website.userId,
        websiteId: website.id,
        type: 'wordpress_outdated',
        title: `WordPress updates available on ${website.name}`,
        description: parts.join('. '),
        severity: 'info',
        status: 'open',
      },
    });
    await triggerAIAnalysisAndAlerts(incident.id, website.userId);
  },
};

async function triggerAIAnalysisAndAlerts(incidentId: string, userId: string): Promise<void> {
  // Run AI analysis and alert dispatch asynchronously
  setImmediate(async () => {
    try {
      await analyzeIncident(incidentId);
    } catch (err: any) {
      logger.warn('AI analysis failed', { incidentId, error: err.message });
    }

    try {
      await dispatchAlerts(incidentId, userId);
    } catch (err: any) {
      logger.warn('Alert dispatch failed', { incidentId, error: err.message });
    }
  });
}
