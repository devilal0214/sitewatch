import OpenAI from 'openai';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { logger } from '../utils/logger';

const openai = config.openai.apiKey ? new OpenAI({ apiKey: config.openai.apiKey }) : null;

export async function analyzeIncident(incidentId: string): Promise<void> {
  if (!openai) {
    logger.debug('OpenAI not configured, skipping AI analysis');
    return;
  }

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: {
      website: true,
      server: { select: { name: true, host: true } },
    },
  });

  if (!incident) return;

  // Gather recent logs for context
  let contextData = '';

  if (incident.websiteId) {
    const recentLogs = await prisma.uptimeLog.findMany({
      where: { websiteId: incident.websiteId },
      orderBy: { checkedAt: 'desc' },
      take: 10,
      select: { status: true, statusCode: true, responseTime: true, errorMessage: true, checkedAt: true },
    });
    contextData += `Recent uptime logs:\n${JSON.stringify(recentLogs, null, 2)}\n\n`;
  }

  if (incident.serverId) {
    const recentMetrics = await prisma.serverMetric.findMany({
      where: { serverId: incident.serverId },
      orderBy: { recordedAt: 'desc' },
      take: 5,
      select: { cpuUsage: true, ramUsage: true, diskUsage: true, loadAvg1: true, recordedAt: true },
    });
    contextData += `Recent server metrics:\n${JSON.stringify(recentMetrics, null, 2)}\n\n`;
  }

  const prompt = buildAnalysisPrompt(incident, contextData);

  try {
    const completion = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: `You are an expert DevOps engineer and system reliability engineer. 
Analyze monitoring incidents and provide concise, actionable root cause analysis.
Your analysis should be professional, technical but understandable, and under 200 words.
Always provide a "Possible Cause" and "Recommended Action" in your response.`,
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: 400,
      temperature: 0.3,
    });

    const aiText = completion.choices[0]?.message?.content || '';

    const [analysis, suggestion] = splitAnalysis(aiText);

    await prisma.incident.update({
      where: { id: incidentId },
      data: { aiAnalysis: analysis, aiSuggestion: suggestion },
    });

    logger.info('AI analysis completed', { incidentId });
  } catch (err: any) {
    logger.warn('AI analysis error', { incidentId, error: err.message });
  }
}

function buildAnalysisPrompt(incident: any, contextData: string): string {
  return `
Incident Details:
- Type: ${incident.type}
- Title: ${incident.title}
- Description: ${incident.description}
- Severity: ${incident.severity}
${incident.website ? `- Website: ${incident.website.name} (${incident.website.url})` : ''}
${incident.server ? `- Server: ${incident.server.name} (${incident.server.host})` : ''}
- Occurred: ${incident.createdAt?.toISOString()}

${contextData ? `Context Data:\n${contextData}` : ''}

Please provide:
1. Possible Cause: (technical explanation)
2. Recommended Action: (immediate steps to resolve)
`.trim();
}

function splitAnalysis(text: string): [string, string] {
  const causeMatch = text.match(/(?:Possible Cause|Root Cause)[:\s]*(.+?)(?=Recommended Action|$)/is);
  const actionMatch = text.match(/Recommended Action[:\s]*(.+)/is);

  const cause = causeMatch?.[1]?.trim() || text;
  const action = actionMatch?.[1]?.trim() || '';

  return [cause, action];
}
