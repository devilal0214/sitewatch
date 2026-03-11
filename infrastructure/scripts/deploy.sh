#!/usr/bin/env bash
# =============================================================================
# JV SiteWatch DevOps — Production Deployment Script
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Prerequisite checks ───────────────────────────────────────────────────────
check_deps() {
  info "Checking prerequisites…"
  for cmd in docker docker-compose git; do
    command -v "$cmd" &>/dev/null || error "$cmd is not installed."
  done
  docker info &>/dev/null || error "Docker daemon is not running."
  info "All prerequisites satisfied."
}

# ── Load environment ──────────────────────────────────────────────────────────
load_env() {
  if [[ -f "$ROOT_DIR/.env" ]]; then
    info "Loading .env file…"
    set -o allexport
    # shellcheck source=/dev/null
    source "$ROOT_DIR/.env"
    set +o allexport
  else
    warn ".env file not found — copying from .env.example"
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    error "Please edit .env with your production values, then re-run this script."
  fi

  # Validate critical vars
  [[ -n "${JWT_SECRET:-}" ]]         || error "JWT_SECRET must be set in .env"
  [[ -n "${JWT_REFRESH_SECRET:-}" ]] || error "JWT_REFRESH_SECRET must be set in .env"
  [[ -n "${POSTGRES_PASSWORD:-}" ]]  || error "POSTGRES_PASSWORD must be set in .env"
}

# ── Pull latest code ──────────────────────────────────────────────────────────
pull_code() {
  info "Pulling latest code…"
  cd "$ROOT_DIR"
  git pull origin main || warn "git pull failed — deploying with current code"
}

# ── Build & start containers ──────────────────────────────────────────────────
deploy() {
  info "Building Docker images (this may take a few minutes)…"
  cd "$ROOT_DIR"
  docker-compose build --no-cache

  info "Starting services…"
  docker-compose up -d --remove-orphans

  info "Waiting for postgres to be healthy…"
  timeout 60 bash -c 'until docker inspect sitewatch_postgres --format "{{.State.Health.Status}}" | grep -q "healthy"; do sleep 2; done'

  info "Running database migrations…"
  docker-compose exec -T backend npx prisma migrate deploy

  info "Restarting backend after migrations…"
  docker-compose restart backend

  info "Deployment complete!"
}

# ── Health check ──────────────────────────────────────────────────────────────
health_check() {
  info "Running health check…"
  sleep 5
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health 2>/dev/null || echo "000")
  if [[ "$HTTP_CODE" == "200" ]]; then
    info "Health check passed (HTTP $HTTP_CODE)"
  else
    warn "Health check returned HTTP $HTTP_CODE — check logs with: docker-compose logs backend"
  fi
}

# ── Show status ───────────────────────────────────────────────────────────────
show_status() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  JV SiteWatch DevOps — Deployment Summary"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  docker-compose ps
  echo ""
  info "Access the dashboard at: ${APP_URL:-http://localhost}"
  echo ""
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
  info "Starting JV SiteWatch deployment…"
  check_deps
  load_env
  if [[ "${1:-}" != "--no-pull" ]]; then
    pull_code
  fi
  deploy
  health_check
  show_status
}

main "$@"
