#!/usr/bin/env bash
# =============================================================================
# JV SiteWatch DevOps — Let's Encrypt SSL Setup
# Usage: ./setup-ssl.sh your-domain.com admin@your-domain.com
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

DOMAIN="${1:-}"
EMAIL="${2:-}"

[[ -n "$DOMAIN" ]] || error "Usage: $0 <domain> <email>"
[[ -n "$EMAIL"  ]] || error "Usage: $0 <domain> <email>"

info "Requesting certificate for $DOMAIN (email: $EMAIL)…"

# Start nginx in HTTP-only mode to serve the ACME challenge
info "Ensuring nginx is running for ACME challenge…"
cd "$ROOT_DIR"
docker-compose up -d nginx certbot 2>/dev/null || true
sleep 3

# Run certbot
docker-compose run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

info "Certificate obtained!"
info "Now enable the HTTPS server block in infrastructure/nginx/conf.d/default.conf"
info "Update server_name and ssl_certificate paths to match: $DOMAIN"
info "Then reload nginx: docker-compose exec nginx nginx -s reload"
