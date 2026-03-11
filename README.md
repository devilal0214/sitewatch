# JV SiteWatch DevOps

A production-grade monitoring platform for digital agencies managing multiple client websites.

## Overview

JV SiteWatch DevOps monitors:

- **Website uptime** — HTTP checks every 1–30 minutes, response time tracking
- **SSL certificates** — expiry warnings and invalid cert detection
- **Domain expiry** — WHOIS-based domain expiry monitoring
- **Server health** — SSH-based CPU, RAM, disk, and load average monitoring
- **Docker containers** — stopped, restarting, and unhealthy container detection
- **WordPress sites** — plugin/theme updates, vulnerability scanning
- **Backup status** — custom backup endpoint validation
- **Performance** — Playwright-based Core Web Vitals (FCP, LCP, CLS, TTFB) monitoring

Alerts are dispatched through **Email, Slack, Telegram, WhatsApp, and custom webhooks**. An optional **OpenAI GPT-4** integration provides AI-powered root cause analysis on incidents. Monthly **PDF reports** are generated automatically per client.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nginx Reverse Proxy                      │
└────────────────────┬──────────────────────┬─────────────────────┘
                     │                      │
              ┌──────▼──────┐       ┌───────▼───────┐
              │  Frontend   │       │    Backend     │
              │  Next.js 14 │       │  Express + TS  │
              └─────────────┘       └───────┬───────┘
                                            │
                         ┌──────────────────┼──────────────────┐
                         │                  │                  │
                  ┌──────▼──────┐   ┌───────▼──────┐  ┌───────▼──────┐
                  │ PostgreSQL  │   │    Redis     │  │  BullMQ      │
                  │  (Prisma)   │   │  (Sessions)  │  │  (7 Queues)  │
                  └─────────────┘   └──────────────┘  └──────────────┘
```

**Tech Stack:**
| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, TypeScript 5.3, Express 4.18 |
| Database | PostgreSQL 16, Prisma ORM 5.10 |
| Queue | Redis 7, BullMQ 5.4 |
| Frontend | Next.js 14, React 18, TailwindCSS 3.4, Recharts |
| State | Zustand, SWR |
| Monitoring | Playwright (Chromium), node-ssh |
| Auth | JWT (access + refresh tokens), bcryptjs |
| Alerts | Nodemailer, Slack Webhook, Telegram Bot API, Twilio |
| AI | OpenAI GPT-4 Turbo |
| Reports | PDFKit |
| Infra | Docker, Docker Compose, Nginx |

---

## Prerequisites

- **Docker** ≥ 24 and **Docker Compose** ≥ 2.20
- A Linux VPS (Ubuntu 22.04 recommended) with 2 GB RAM minimum
- (Optional) A domain name with DNS pointed to your VPS

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/your-org/jv-sitewatch.git
cd jv-sitewatch
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env   # Edit with your values
```

**Critical variables to set:**
```dotenv
JWT_SECRET=<64 random chars>       # openssl rand -base64 64
JWT_REFRESH_SECRET=<64 random chars>
POSTGRES_PASSWORD=<strong password>
REDIS_PASSWORD=<strong password>
SMTP_HOST=smtp.gmail.com
SMTP_USER=your@gmail.com
SMTP_PASS=your_app_password
APP_URL=https://your-domain.com
AGENCY_NAME=Your Agency Name
```

### 3. Deploy

```bash
chmod +x infrastructure/scripts/deploy.sh
./infrastructure/scripts/deploy.sh
```

The script will:
1. Build Docker images for backend and frontend
2. Start all services (postgres, redis, backend, frontend, nginx)
3. Run database migrations (`prisma migrate deploy`)
4. Print the dashboard URL

### 4. First login

On first deploy, create your admin account by registering at `https://your-domain.com/register`.

> **Note:** The first registered user gets the `AGENCY` role. To promote to `ADMIN`, run:
> ```bash
> docker-compose exec backend npx prisma studio
> # or connect directly to postgres and UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';
> ```

---

## SSL Setup (Let's Encrypt)

```bash
chmod +x infrastructure/scripts/setup-ssl.sh
./infrastructure/scripts/setup-ssl.sh your-domain.com admin@your-domain.com
```

Then edit `infrastructure/nginx/conf.d/default.conf`:
1. Comment out the HTTP-only redirect server block
2. Uncomment the HTTPS server block
3. Replace `your-domain.com` with your actual domain
4. Reload nginx: `docker-compose exec nginx nginx -s reload`

---

## Configuration

### Monitoring Thresholds (in `.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `CHECK_TIMEOUT_MS` | `10000` | HTTP check timeout |
| `SLOW_RESPONSE_THRESHOLD_MS` | `3000` | Response time before creating slow-response incident |
| `SSL_EXPIRY_WARNING_DAYS` | `30` | Days before SSL expiry to trigger warning |
| `DOMAIN_EXPIRY_WARNING_DAYS` | `60` | Days before domain expiry to trigger warning |
| `CPU_WARNING_PERCENT` | `85` | CPU threshold for server overload incident |
| `RAM_WARNING_PERCENT` | `90` | RAM threshold |
| `DISK_WARNING_PERCENT` | `85` | Disk threshold |
| `BACKUP_MAX_AGE_HOURS` | `26` | Hours before backup is considered overdue |

---

## Development Setup

### Backend

```bash
cd backend
npm install
cp .env.example .env   # configure DATABASE_URL and REDIS_URL for local instances
npx prisma migrate dev
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:3001
npm run dev
```

### Running Tests

```bash
cd backend
npm test                 # run all tests with coverage
npm run test:watch       # watch mode
```

---

## API Reference

All API routes are prefixed with `/api`.

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Register new user |
| `POST` | `/auth/login` | Login, returns access + refresh tokens |
| `POST` | `/auth/refresh` | Refresh access token |
| `POST` | `/auth/logout` | Invalidate refresh token |
| `GET`  | `/auth/me` | Get current user |
| `PUT`  | `/auth/profile` | Update profile |
| `PUT`  | `/auth/change-password` | Change password |

### Websites

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/websites` | List all websites |
| `POST` | `/websites` | Add a website |
| `GET`  | `/websites/:id` | Get website details |
| `PATCH`| `/websites/:id` | Update website |
| `DELETE`| `/websites/:id` | Delete website |
| `GET`  | `/websites/:id/uptime` | Get uptime logs |
| `GET`  | `/websites/:id/performance` | Get performance logs |
| `POST` | `/websites/:id/trigger-check` | Trigger immediate check |

### Servers

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/servers` | List servers |
| `POST` | `/servers` | Add server (SSH credentials) |
| `GET`  | `/servers/:id/metrics` | Get server metrics history |
| `GET`  | `/servers/:id/containers` | List Docker containers |

### Incidents

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/incidents` | List incidents (filterable by status/severity) |
| `GET`  | `/incidents/:id` | Get incident details |
| `PATCH`| `/incidents/:id/acknowledge` | Acknowledge incident |
| `PATCH`| `/incidents/:id/resolve` | Resolve incident |
| `GET`  | `/incidents/stats/summary` | Incident statistics |

### Alerts

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/alerts` | List alert rules |
| `POST` | `/alerts` | Create alert rule |
| `PATCH`| `/alerts/:id` | Update rule |
| `PATCH`| `/alerts/:id/toggle` | Enable/disable rule |
| `DELETE`| `/alerts/:id` | Delete rule |

### Reports

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/reports` | List reports |
| `POST` | `/reports/generate` | Queue report generation |
| `GET`  | `/reports/:id` | Get report details |

### Status Page (Public)

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/status/:slug` | Public status page data |

---

## WordPress Integration

WordPress deep monitoring requires the companion plugin. Install `jv-sitewatch-companion` on each WordPress site and add the site's application password in the website settings. The plugin exposes:

```
GET /wp-json/jv-sitewatch/v1/plugins
GET /wp-json/jv-sitewatch/v1/themes
GET /wp-json/jv-sitewatch/v1/vulnerabilities
```

---

## Scaling to 1000+ Websites

JV SiteWatch DevOps is designed for scale:

- **BullMQ concurrency**: Uptime checks run at 50 concurrent workers with a 200 req/s rate limiter
- **Horizontal scaling**: Run multiple backend replicas behind a load balancer; BullMQ coordinates via Redis
- **Database**: Add read replicas for `UptimeLog` queries; `uptimeLog` table is indexed by `websiteId + checkedAt`
- **Redis Cluster**: Switch `REDIS_URL` to a cluster endpoint for high-availability
- **Check distribution**: Each website's `checkInterval` is respected individually, so 1000 sites at 5-min intervals = ~3.3 checks/sec (well within limits)

**Recommended VPS sizing:**

| Websites | RAM | CPU | Storage |
|----------|-----|-----|---------|
| < 100 | 2 GB | 2 vCPU | 20 GB |
| 100–500 | 4 GB | 4 vCPU | 50 GB |
| 500–1000 | 8 GB | 8 vCPU | 100 GB |
| 1000+ | 16 GB | 16 vCPU | 200 GB |

---

## Backup

```bash
# Backup database
docker-compose exec postgres pg_dump -U sitewatch sitewatch | gzip > sitewatch_$(date +%F).sql.gz

# Backup reports (PDFs)
tar -czf reports_$(date +%F).tar.gz $(docker volume inspect sitewatch_reports_data --format '{{ .Mountpoint }}')
```

---

## Monitoring the Monitor

A health endpoint is available at:

```
GET /health
```

Returns `200 OK` with JSON status of database and Redis connections. Use this with UptimeRobot, Pingdom, or another external service to monitor the monitor itself.

---

## License

MIT © JV Digital Agency
