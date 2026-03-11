import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function sendWhatsAppAlert(phone: string, message: any): Promise<void> {
  const { accountSid, authToken, whatsappFrom } = config.twilio;

  if (!accountSid || !authToken) {
    logger.warn('Twilio credentials not configured, skipping WhatsApp alert');
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const params = new URLSearchParams({
    From: whatsappFrom,
    To: `whatsapp:${phone}`,
    Body: message.text.substring(0, 1600),
  });

  await axios.post(url, params, {
    auth: { username: accountSid, password: authToken },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  logger.info('WhatsApp alert sent', { phone });
}
