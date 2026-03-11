FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .
RUN npm run build
RUN npm run prisma:generate

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Install Playwright deps and chromium for synthetic monitoring
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    openssh-client

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROMIUM_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production
RUN npm run prisma:generate

COPY --from=builder /app/dist ./dist

RUN addgroup -S sitewatch && adduser -S sitewatch -G sitewatch
RUN chown -R sitewatch:sitewatch /app
USER sitewatch

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
