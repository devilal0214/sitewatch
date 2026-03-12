#!/bin/bash
# ============================================================
# JV SiteWatch – VPS Deployment Script (CyberPanel / OLS)
# Run as root or sudo on the VPS
# Usage: bash deploy.sh
# ============================================================

set -e

APP_DIR="/home/sites.jaiveeru.site/public_html/sitewatch"
REPO_URL="https://github.com/devilal0214/sitewatch.git"
NODE_VERSION="20"

echo "================================================="
echo " JV SiteWatch – Deployment Starting"
echo "================================================="

# ----------------------------------------------------------
# 1. System dependencies
# ----------------------------------------------------------
echo "[1/9] Installing system packages..."
apt-get update -y
apt-get install -y git curl build-essential

# Node.js 20 via NodeSource
if ! command -v node &>/dev/null || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  echo "  → Installing Node.js $NODE_VERSION..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
echo "  ✓ Node $(node -v) | npm $(npm -v)"

# PM2
if ! command -v pm2 &>/dev/null; then
  echo "[2/9] Installing PM2..."
  npm install -g pm2
fi
echo "  ✓ PM2 $(pm2 -v)"

# ----------------------------------------------------------
# 2. PostgreSQL
# ----------------------------------------------------------
echo "[3/9] Setting up PostgreSQL..."
if ! command -v psql &>/dev/null; then
  apt-get install -y postgresql postgresql-contrib
  systemctl enable postgresql
  systemctl start postgresql
fi
# Create DB user and database (skip if already exists)
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='sitewatch'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER sitewatch WITH PASSWORD 'SiteWatch2026!';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='sitewatch_db'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE sitewatch_db OWNER sitewatch;"
echo "  ✓ PostgreSQL ready | DB: sitewatch_db | User: sitewatch"

# ----------------------------------------------------------
# 3. Redis
# ----------------------------------------------------------
echo "[4/9] Setting up Redis..."
if ! command -v redis-cli &>/dev/null; then
  apt-get install -y redis-server
  # Set a password in redis.conf
  sed -i 's/^# requirepass .*/requirepass SiteWatchRedis2026!/' /etc/redis/redis.conf
  sed -i 's/^requirepass .*/requirepass SiteWatchRedis2026!/' /etc/redis/redis.conf
  systemctl enable redis-server
  systemctl restart redis-server
fi
echo "  ✓ Redis running"

# ----------------------------------------------------------
# 4. Clone / update repo
# ----------------------------------------------------------
echo "[5/9] Deploying application code..."
if [ -d "$APP_DIR/.git" ]; then
  echo "  → Pulling latest from GitHub..."
  cd "$APP_DIR"
  git pull origin main
else
  echo "  → Cloning repo..."
  mkdir -p /home/sites.jaiveeru.site/public_html
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

# ----------------------------------------------------------
# 5. Backend setup
# ----------------------------------------------------------
echo "[6/9] Setting up Backend..."
cd "$APP_DIR/backend"

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3001
APP_NAME="JV SiteWatch DevOps"
APP_URL=https://api.sitewatch.jaiveeru.site

DATABASE_URL=postgresql://sitewatch:SiteWatch2026!@localhost:5432/sitewatch_db

REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=SiteWatchRedis2026!

JWT_SECRET=CHANGE_THIS_JWT_SECRET_MIN_32_CHARS
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=CHANGE_THIS_REFRESH_SECRET_MIN_32_CHARS
JWT_REFRESH_EXPIRES_IN=30d

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM="JV SiteWatch <your@gmail.com>"

SLACK_BOT_TOKEN=
TELEGRAM_BOT_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
OPENAI_API_KEY=

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
ENVEOF
  echo "  ✓ Created backend/.env — EDIT the JWT secrets and SMTP before starting!"
fi

npm install --production
npx prisma generate
npx prisma migrate deploy
npm run build 2>/dev/null || echo "  (no build step, using ts-node-dev)"

# ----------------------------------------------------------
# 6. Frontend setup
# ----------------------------------------------------------
echo "[7/9] Setting up Frontend..."
cd "$APP_DIR/frontend"

if [ ! -f .env.local ]; then
  cat > .env.local << 'ENVEOF'
NEXT_PUBLIC_API_URL=https://api.sitewatch.jaiveeru.site
NEXT_PUBLIC_APP_NAME="JV SiteWatch DevOps"
NEXT_PUBLIC_APP_URL=https://sitewatch.jaiveeru.site
ENVEOF
  echo "  ✓ Created frontend/.env.local"
fi

npm install
npm run build

# ----------------------------------------------------------
# 7. PM2 process management
# ----------------------------------------------------------
echo "[8/9] Configuring PM2..."
cd "$APP_DIR"

cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'sitewatch-backend',
      cwd: './backend',
      script: 'npx',
      args: 'ts-node-dev --respawn --transpile-only src/index.ts',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/sitewatch/backend-err.log',
      out_file: '/var/log/sitewatch/backend-out.log',
    },
    {
      name: 'sitewatch-frontend',
      cwd: './frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production', PORT: '3000' },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      error_file: '/var/log/sitewatch/frontend-err.log',
      out_file: '/var/log/sitewatch/frontend-out.log',
    },
  ],
};
EOF

mkdir -p /var/log/sitewatch
pm2 delete sitewatch-backend sitewatch-frontend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash 2>/dev/null || true

echo "  ✓ PM2 processes started"

# ----------------------------------------------------------
# 8. Playwright browsers (for performance monitoring)
# ----------------------------------------------------------
echo "[9/9] Installing Playwright Chromium..."
cd "$APP_DIR/backend"
npx playwright install chromium --with-deps 2>/dev/null || true

echo ""
echo "================================================="
echo " Deployment complete!"
echo ""
echo " Next steps:"
echo "  1. Edit $APP_DIR/backend/.env"
echo "     → Set real JWT_SECRET and SMTP credentials"
echo "  2. In CyberPanel, create 2 subdomains:"
echo "     → sitewatch.jaiveeru.site   (proxy → 127.0.0.1:3000)"
echo "     → api.sitewatch.jaiveeru.site (proxy → 127.0.0.1:3001)"
echo "  3. Issue SSL for both in CyberPanel → SSL → Let's Encrypt"
echo ""
echo " PM2 status: pm2 status"
echo " PM2 logs:   pm2 logs"
echo "================================================="
