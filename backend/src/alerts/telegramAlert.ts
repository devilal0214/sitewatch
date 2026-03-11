import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function sendTelegramAlert(chatId: string, message: any): Promise<void> {
  const text = escapeMarkdown(message.text);

  await axios.post(
    `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`,
    {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
    },
    { timeout: 10000 },
  );

  logger.info('Telegram alert sent', { chatId });
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
