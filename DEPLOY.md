# JV SiteWatch — CyberPanel VPS Deployment Guide

## Architecture Overview

| Subdomain | User | Home Path | Role | Port |
|-----------|------|-----------|------|------|
| `sitewatch.jaiveeru.site` | `sitew1875` | `/home/sitewatch.jaiveeru.site/` | Next.js Dashboard | 3000 |
| `api.sitewatch.jaiveeru.site` | `apisi3307` | `/home/api.sitewatch.jaiveeru.site/` | Express Backend API | 4000 |
| `sites.jaiveeru.site` | `sites3163` | `/home/sites.jaiveeru.site/` | Public Status Pages (proxied → 3000) | — |

**No Docker.** Each service runs under its own CyberPanel Linux user via **PM2**.  
**OpenLiteSpeed** (managed by CyberPanel) handles SSL and proxies requests to the Node.js processes.

---

## One-Time Server Setup (run as root)

### 1. Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v   # v20.x.x
```

### 2. Install PM2 globally
```bash
npm install -g pm2
```

### 3. Install & secure Redis
```bash
apt-get install -y redis-server
systemctl enable redis-server && systemctl start redis-server

# Set a strong password
REDIS_PASS="$(openssl rand -hex 24)"
echo "Your Redis password: $REDIS_PASS"
sed -i "s/# requirepass foobared/requirepass $REDIS_PASS/" /etc/redis/redis.conf
# Also bind to localhost only (security)
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
systemctl restart redis-server
```

### 4. Install PostgreSQL
```bash
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql && systemctl start postgresql
```

### 5. Create the database
```bash
DB_PASS="$(openssl rand -hex 24)"
echo "Your DB password: $DB_PASS"

sudo -u postgres psql <<SQL
CREATE USER sitewatch WITH PASSWORD '$DB_PASS';
CREATE DATABASE sitewatch OWNER sitewatch;
GRANT ALL PRIVILEGES ON DATABASE sitewatch TO sitewatch;
SQL
```

### 6. Install Playwright browsers (for performance monitoring)
```bash
npx playwright install chromium --with-deps
```

---

## Step 1 — Issue SSL Certificates

In **CyberPanel Admin Panel → SSL → Manage SSL**, issue Let's Encrypt for:
- `sitewatch.jaiveeru.site`
- `api.sitewatch.jaiveeru.site`
- `sites.jaiveeru.site`

Or via CLI:
```bash
cyberpanel issueSSL --domainName sitewatch.jaiveeru.site
cyberpanel issueSSL --domainName api.sitewatch.jaiveeru.site
cyberpanel issueSSL --domainName sites.jaiveeru.site
```

---

## Step 2 — Deploy Backend

Switch to the backend user and set everything up:

```bash
su - apisi3307
cd /home/api.sitewatch.jaiveeru.site

# Clone the repo
git clone https://github.com/devilal0214/sitewatch.git app
cd app/backend

# Create and configure .env
cp ../.env.example .env
nano .env
```

Fill in your `.env` values (see the [Backend .env Reference](#backend-env-reference) section below), then continue:

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Build TypeScript → dist/
npm run build

# Create logs directory
mkdir -p /home/api.sitewatch.jaiveeru.site/logs

# Copy ecosystem and start PM2
cp /home/api.sitewatch.jaiveeru.site/app/infrastructure/pm2/ecosystem.backend.js \
   /home/api.sitewatch.jaiveeru.site/ecosystem.backend.js

pm2 start /home/api.sitewatch.jaiveeru.site/ecosystem.backend.js
pm2 save
pm2 startup   # → copy and run the printed command as root
```

Verify: `curl http://127.0.0.1:4000/health` should return `{"status":"ok"}`

---

## Step 3 — Deploy Frontend

```bash
su - sitew1875
cd /home/sitewatch.jaiveeru.site

# Clone the repo
git clone https://github.com/devilal0214/sitewatch.git app
cd app/frontend

# Create Next.js environment file
cat > .env.local <<'EOF'
NEXT_PUBLIC_API_URL=https://api.sitewatch.jaiveeru.site
NEXT_PUBLIC_APP_URL=https://sitewatch.jaiveeru.site
NEXT_PUBLIC_STATUS_URL=https://sites.jaiveeru.site
EOF

# Install dependencies and build
npm install
npm run build

# Create logs directory
mkdir -p /home/sitewatch.jaiveeru.site/logs

# Copy ecosystem and start PM2
cp /home/sitewatch.jaiveeru.site/app/infrastructure/pm2/ecosystem.frontend.js \
   /home/sitewatch.jaiveeru.site/ecosystem.frontend.js

pm2 start /home/sitewatch.jaiveeru.site/ecosystem.frontend.js
pm2 save
pm2 startup   # → copy and run the printed command as root
```

Verify: `curl http://127.0.0.1:3000` should return the HTML page.

---

## Step 4 — Configure OLS Reverse Proxy (.htaccess)

CyberPanel uses OpenLiteSpeed. Place the proxy `.htaccess` in each domain's `public_html/`:

### sitewatch.jaiveeru.site (dashboard → port 3000)
```bash
cp /home/sitewatch.jaiveeru.site/app/infrastructure/openlitespeed/htaccess-sitewatch \
   /home/sitewatch.jaiveeru.site/public_html/.htaccess
chown sitew1875:sitew1875 /home/sitewatch.jaiveeru.site/public_html/.htaccess
```

### api.sitewatch.jaiveeru.site (API → port 4000)
```bash
cp /home/api.sitewatch.jaiveeru.site/app/infrastructure/openlitespeed/htaccess-api \
   /home/api.sitewatch.jaiveeru.site/public_html/.htaccess
chown apisi3307:apisi3307 /home/api.sitewatch.jaiveeru.site/public_html/.htaccess
```

### sites.jaiveeru.site (public status pages → proxied to port 3000)
```bash
cp /home/api.sitewatch.jaiveeru.site/app/infrastructure/openlitespeed/htaccess-sites \
   /home/sites.jaiveeru.site/public_html/.htaccess
chown sites3163:sites3163 /home/sites.jaiveeru.site/public_html/.htaccess
```

> **Why does `sites.jaiveeru.site` proxy to port 3000?**  
> The Next.js app already contains the public `/status/[slug]` route. No separate
> process is needed — clients visit `https://sites.jaiveeru.site/status/your-slug`
> and the frontend renders their status page without any login.

### Reload OLS to apply .htaccess changes
```bash
/usr/local/lsws/bin/lswsctrl restart
# or from CyberPanel Admin → Server → Restart OpenLiteSpeed
```

---

## Step 5 — Enable PM2 Auto-start on Reboot

After running `pm2 startup` in steps 2 & 3, it prints a command like:
```bash
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u apisi3307 --hp /home/api.sitewatch.jaiveeru.site
```
Run that **as root** for each user. Then:
```bash
su - apisi3307 -c "pm2 save"
su - sitew1875 -c "pm2 save"
```

---

## Backend .env Reference

Edit `/home/api.sitewatch.jaiveeru.site/app/backend/.env`:

```env
NODE_ENV=production
PORT=4000
APP_URL=https://sitewatch.jaiveeru.site

# PostgreSQL — use localhost (NOT the Docker service name)
DATABASE_URL=postgresql://sitewatch:YOUR_DB_PASSWORD@localhost:5432/sitewatch

# Redis — use localhost (NOT the Docker service name)
REDIS_URL=redis://:YOUR_REDIS_PASSWORD@localhost:6379

# JWT secrets — generate with: openssl rand -base64 64
JWT_SECRET=REPLACE_WITH_64_CHAR_RANDOM_STRING
JWT_REFRESH_SECRET=REPLACE_WITH_DIFFERENT_64_CHAR_RANDOM_STRING
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# SMTP (Gmail App Password recommended)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM="JV SiteWatch <alerts@jaiveeru.site>"

# Agency branding
AGENCY_NAME=JV Digital Agency
AGENCY_WEBSITE=https://jaiveeru.site

# Monitoring thresholds
CHECK_TIMEOUT_MS=10000
SLOW_RESPONSE_THRESHOLD_MS=3000
SSL_EXPIRY_WARNING_DAYS=30
DOMAIN_EXPIRY_WARNING_DAYS=60
CPU_WARNING_PERCENT=85
RAM_WARNING_PERCENT=90

# Optional integrations
# SLACK_DEFAULT_WEBHOOK=https://hooks.slack.com/services/...
# TELEGRAM_BOT_TOKEN=your_bot_token
# TELEGRAM_DEFAULT_CHAT_ID=-100xxxxxxxxxx
# OPENAI_API_KEY=sk-...
```

---

## Future Re-deployments (Updates)

After the initial install, just run this as root whenever you push new code:

```bash
bash /home/api.sitewatch.jaiveeru.site/app/infrastructure/scripts/deploy-cyberpanel.sh
```

The script:
1. `git pull` on both repos
2. `npm install` + `npm run build` for both
3. `npx prisma migrate deploy` for the backend
4. `pm2 reload` for zero-downtime restart of both processes

---

## Useful Commands

```bash
# ── PM2 status ────────────────────────────────────────────────────────────────
su - apisi3307 -c "pm2 status"
su - sitew1875 -c "pm2 status"

# ── Logs ─────────────────────────────────────────────────────────────────────
su - apisi3307 -c "pm2 logs sitewatch-backend --lines 50"
su - sitew1875 -c "pm2 logs sitewatch-frontend --lines 50"

# ── Manual restarts ───────────────────────────────────────────────────────────
su - apisi3307 -c "pm2 restart sitewatch-backend"
su - sitew1875 -c "pm2 restart sitewatch-frontend"

# ── Check ports in use ────────────────────────────────────────────────────────
ss -tlnp | grep -E '3000|4000'

# ── PostgreSQL quick check ────────────────────────────────────────────────────
sudo -u postgres psql -c '\l'

# ── Redis ping ────────────────────────────────────────────────────────────────
redis-cli -a YOUR_REDIS_PASSWORD ping    # should return PONG
```

---

## Firewall Notes

CyberPanel manages UFW/CSF. The Node.js ports (3000, 4000) must **NOT** be publicly exposed — OLS proxies them internally. Only these ports should be open:

```bash
ufw status     # 22 (SSH), 80 (HTTP), 443 (HTTPS), 8090 (CyberPanel)
```

To block accidental direct access to Node ports from outside:
```bash
ufw deny 3000
ufw deny 4000
```
