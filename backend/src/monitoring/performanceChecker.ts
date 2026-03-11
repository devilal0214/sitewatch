import { chromium } from 'playwright';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';

export async function checkPerformance(websiteId: string): Promise<void> {
  const website = await prisma.website.findUnique({ where: { id: websiteId } });
  if (!website || !website.isActive || !website.monitorPerformance) return;

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();

    const metrics: any = { ttfb: 0, responseTime: 0, pageLoadTime: 0 };

    let ttfbCaptured = false;
    const startTime = Date.now();

    page.on('response', (response) => {
      if (!ttfbCaptured && response.url() === website.url) {
        metrics.ttfb = Date.now() - startTime;
        ttfbCaptured = true;
      }
    });

    await page.goto(website.url, { waitUntil: 'networkidle', timeout: 30000 });

    metrics.pageLoadTime = Date.now() - startTime;
    metrics.responseTime = metrics.ttfb;

    // Web Vitals via CDP
    const webVitals = await page.evaluate(() => {
      return new Promise<{ fcp?: number; lcp?: number; cls?: number; tbt?: number }>((resolve) => {
        const result: any = {};
        let resolved = false;

        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if ((entry.entryType as string) === 'paint' && entry.name === 'first-contentful-paint') {
              result.fcp = Math.round(entry.startTime);
            }
            if ((entry.entryType as string) === 'largest-contentful-paint') {
              result.lcp = Math.round(entry.startTime);
            }
          }
        });

        try {
          observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] as any });
        } catch { /* ignore */ }

        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
        }, 3000);
      });
    });

    // Simple Lighthouse-like score (0-100)
    const score = calculateScore({
      fcp: webVitals.fcp || metrics.ttfb,
      lcp: webVitals.lcp || metrics.pageLoadTime,
      pageLoadTime: metrics.pageLoadTime,
    });

    await prisma.performanceLog.create({
      data: {
        websiteId,
        responseTime: metrics.responseTime,
        ttfb: metrics.ttfb,
        pageLoadTime: metrics.pageLoadTime,
        lighthouseScore: score,
        fcp: webVitals.fcp,
        lcp: webVitals.lcp,
        cls: webVitals.cls,
        tbt: webVitals.tbt,
        recordedAt: new Date(),
      },
    });

    logger.debug('Performance check complete', { websiteId, score, pageLoadTime: metrics.pageLoadTime });
  } catch (err: any) {
    logger.error('Performance check failed', { websiteId, error: err.message });
    await prisma.performanceLog.create({
      data: {
        websiteId,
        errorMessage: err.message,
        recordedAt: new Date(),
      },
    });
  } finally {
    await browser?.close();
  }
}

function calculateScore({ fcp, lcp, pageLoadTime }: { fcp: number; lcp: number; pageLoadTime: number }): number {
  // Simplified scoring based on Core Web Vitals thresholds
  let score = 100;

  if (fcp > 1800) score -= 20;
  else if (fcp > 3000) score -= 40;

  if (lcp > 2500) score -= 20;
  else if (lcp > 4000) score -= 40;

  if (pageLoadTime > 3000) score -= 10;
  else if (pageLoadTime > 5000) score -= 30;

  return Math.max(0, Math.min(100, score));
}
