import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
});

export async function sendEmailAlert(to: string, message: any, incident: any): Promise<void> {
  const severityColor: Record<string, string> = {
    critical: '#dc2626',
    warning: '#d97706',
    info: '#2563eb',
  };

  const color = severityColor[incident.severity] || '#6b7280';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${incident.title}</title></head>
<body style="font-family: Arial, sans-serif; background: #f9fafb; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <div style="background: ${color}; padding: 20px 30px;">
      <h1 style="color: white; margin: 0; font-size: 20px;">${message.emoji} ${incident.title}</h1>
    </div>
    <div style="padding: 30px;">
      <p style="color: #374151; font-size: 16px;">${incident.description || ''}</p>
      ${incident.website ? `<p><strong>Site:</strong> <a href="${incident.website.url}">${incident.website.name}</a></p>` : ''}
      ${incident.server ? `<p><strong>Server:</strong> ${incident.server.name} (${incident.server.host})</p>` : ''}
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr style="background: #f3f4f6;">
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Severity</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb; color: ${color}; font-weight: bold;">${incident.severity.toUpperCase()}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Incident Type</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${incident.type.replace(/_/g, ' ').toUpperCase()}</td>
        </tr>
        <tr style="background: #f3f4f6;">
          <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">Time (UTC)</td>
          <td style="padding: 10px; border: 1px solid #e5e7eb;">${new Date().toUTCString()}</td>
        </tr>
        ${incident.aiAnalysis ? `<tr><td colspan="2" style="padding: 10px; border: 1px solid #e5e7eb;"><strong>AI Analysis:</strong><br>${incident.aiAnalysis}</td></tr>` : ''}
      </table>
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
        <a href="${config.app.url}/incidents/${incident.id}" style="background: ${color}; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">View Incident</a>
      </div>
    </div>
    <div style="background: #f9fafb; padding: 15px 30px; text-align: center; color: #6b7280; font-size: 12px;">
      Powered by ${config.app.name} | ${config.agency.name}
    </div>
  </div>
</body>
</html>`;

  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject: `${message.emoji} [${incident.severity.toUpperCase()}] ${incident.title}`,
    text: message.text,
    html,
  });

  logger.info('Email alert sent', { to, incidentId: incident.id });
}
