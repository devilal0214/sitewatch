import dotenv from 'dotenv';
dotenv.config();

export const config = {
  app: {
    name: process.env.APP_NAME || 'JV SiteWatch DevOps',
    url: process.env.APP_URL || 'http://localhost:3001',
    port: parseInt(process.env.PORT || '3001', 10),
    env: process.env.NODE_ENV || 'development',
    isDev: process.env.NODE_ENV === 'development',
  },
  db: {
    url: process.env.DATABASE_URL!,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'change-this-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'JV SiteWatch <noreply@jvsitewatch.com>',
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN || '',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  },
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    whatsappFrom: process.env.TWILIO_WHATSAPP_FROM || '',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  monitoring: {
    uptimeInterval: parseInt(process.env.UPTIME_CHECK_INTERVAL || '60000', 10),
    sslInterval: parseInt(process.env.SSL_CHECK_INTERVAL || '3600000', 10),
    domainInterval: parseInt(process.env.DOMAIN_CHECK_INTERVAL || '86400000', 10),
    serverInterval: parseInt(process.env.SERVER_CHECK_INTERVAL || '60000', 10),
  },
  thresholds: {
    sslExpiryWarningDays: parseInt(process.env.SSL_EXPIRY_WARNING_DAYS || '15', 10),
    domainExpiryWarningDays: parseInt(process.env.DOMAIN_EXPIRY_WARNING_DAYS || '30', 10),
    backupMaxAgeHours: parseInt(process.env.BACKUP_MAX_AGE_HOURS || '24', 10),
    responseTimeWarningMs: parseInt(process.env.RESPONSE_TIME_WARNING_MS || '3000', 10),
    cpuWarning: parseInt(process.env.CPU_WARNING_THRESHOLD || '80', 10),
    ramWarning: parseInt(process.env.RAM_WARNING_THRESHOLD || '85', 10),
    diskWarning: parseInt(process.env.DISK_WARNING_THRESHOLD || '90', 10),
  },
  reports: {
    scheduleCron: process.env.REPORT_SCHEDULE_CRON || '0 8 1 * *',
  },
  agency: {
    name: process.env.AGENCY_NAME || 'Your Agency',
    logo: process.env.AGENCY_LOGO_URL || '',
    website: process.env.AGENCY_WEBSITE || '',
    email: process.env.AGENCY_EMAIL || '',
    phone: process.env.AGENCY_PHONE || '',
    address: process.env.AGENCY_ADDRESS || '',
  },
} as const;
