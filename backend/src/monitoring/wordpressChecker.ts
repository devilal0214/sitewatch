import axios from 'axios';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { incidentManager } from './incidentManager';

interface WPPlugin {
  name: string;
  slug: string;
  version: string;
  update_available: boolean;
  latest_version?: string;
  status: 'active' | 'inactive';
}

interface WPTheme {
  name: string;
  version: string;
  update_available: boolean;
  latest_version?: string;
  status: 'active' | 'inactive';
}

export async function checkWordPress(websiteId: string): Promise<void> {
  const website = await prisma.website.findUnique({ where: { id: websiteId } });
  if (!website || !website.isActive || !website.monitorWordPress) return;

  const baseUrl = website.url.replace(/\/$/, '');

  try {
    const [coreInfo, pluginsInfo, themesInfo] = await Promise.allSettled([
      fetchWPCoreInfo(baseUrl),
      fetchWPPlugins(baseUrl),
      fetchWPThemes(baseUrl),
    ]);

    const core = coreInfo.status === 'fulfilled' ? coreInfo.value : null;
    const plugins = pluginsInfo.status === 'fulfilled' ? pluginsInfo.value : [];
    const themes = themesInfo.status === 'fulfilled' ? themesInfo.value : [];

    // Check for vulnerabilities (simple version-based check)
    const vulnerabilities = checkVulnerabilities(plugins);

    const needsCoreUpdate = core?.needs_update ?? false;
    const outdatedPlugins = plugins.filter((p) => p.update_available && p.status === 'active');

    await prisma.wordPressData.upsert({
      where: { websiteId },
      create: {
        websiteId,
        coreVersion: core?.version,
        latestCoreVersion: core?.latest_version,
        needsCoreUpdate,
        phpVersion: core?.php_version,
        plugins,
        themes,
        vulnerabilities,
        apiHealthy: true,
        lastCheckedAt: new Date(),
      },
      update: {
        coreVersion: core?.version,
        latestCoreVersion: core?.latest_version,
        needsCoreUpdate,
        phpVersion: core?.php_version,
        plugins,
        themes,
        vulnerabilities,
        apiHealthy: true,
        lastCheckedAt: new Date(),
      },
    });

    if (vulnerabilities.length > 0) {
      await incidentManager.createWordPressVulnerabilityIncident(website, vulnerabilities.length);
    }

    if (outdatedPlugins.length > 0 || needsCoreUpdate) {
      await incidentManager.createWordPressOutdatedIncident(website, outdatedPlugins.length, needsCoreUpdate);
    }
  } catch (err: any) {
    logger.error('WordPress check failed', { websiteId, error: err.message });
    await prisma.wordPressData.upsert({
      where: { websiteId },
      create: { websiteId, apiHealthy: false, lastCheckedAt: new Date() },
      update: { apiHealthy: false, lastCheckedAt: new Date() },
    });
  }
}

async function fetchWPCoreInfo(baseUrl: string) {
  const response = await axios.get(`${baseUrl}/wp-json/`, {
    timeout: 10000,
    headers: { 'User-Agent': 'JV-SiteWatch/1.0' },
  });

  return {
    version: response.data?.generator?.match(/WordPress\/([\d.]+)/)?.[1],
    needs_update: false,
    latest_version: null,
    php_version: null,
  };
}

async function fetchWPPlugins(baseUrl: string): Promise<WPPlugin[]> {
  try {
    const response = await axios.get(`${baseUrl}/wp-json/jv-sitewatch/v1/plugins`, {
      timeout: 10000,
      headers: { 'User-Agent': 'JV-SiteWatch/1.0' },
    });
    return response.data || [];
  } catch {
    // Plugin endpoint requires our companion plugin; return empty if not available
    return [];
  }
}

async function fetchWPThemes(baseUrl: string): Promise<WPTheme[]> {
  try {
    const response = await axios.get(`${baseUrl}/wp-json/jv-sitewatch/v1/themes`, {
      timeout: 10000,
      headers: { 'User-Agent': 'JV-SiteWatch/1.0' },
    });
    return response.data || [];
  } catch {
    return [];
  }
}

function checkVulnerabilities(plugins: WPPlugin[]) {
  // In production, integrate with WPScan API or similar
  return plugins
    .filter((p) => p.update_available && p.status === 'active')
    .map((p) => ({
      plugin: p.slug,
      severity: 'medium',
      description: `Plugin ${p.name} is outdated (${p.version} → ${p.latest_version}). Update recommended.`,
    }));
}
