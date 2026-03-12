#!/usr/bin/env bash
# =============================================================================
# JV SiteWatch — CyberPanel VPS Re-deploy / Update Script
# Run as root: bash infrastructure/scripts/deploy-cyberpanel.sh
#
# Domain layout:
#   sitewatch.jaiveeru.site     → Next.js frontend  (port 3000, user sitew1875)
#   api.sitewatch.jaiveeru.site → Express backend   (port 4000, user apisi3307)
#   sites.jaiveeru.site         → Public status pages (proxied → port 3000)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }
section() { echo -e "\n${CYAN}══════════════════════════════════════════${NC}"; echo -e "${CYAN}  $*${NC}"; echo -e "${CYAN}══════════════════════════════════════════${NC}"; }

# ── Paths & users ─────────────────────────────────────────────────────────────
BACKEND_USER="apisi3307"
FRONTEND_USER="sitew1875"
BACKEND_DIR="/home/api.sitewatch.jaiveeru.site/app"
FRONTEND_DIR="/home/sitewatch.jaiveeru.site/app"
BACKEND_APP="$BACKEND_DIR/backend"
FRONTEND_APP="$FRONTEND_DIR/frontend"
REPO_URL="https://github.com/devilal0214/sitewatch.git"

# ── Guard: must run as root ───────────────────────────────────────────────────
[[ "$EUID" -eq 0 ]] || error "Run this script as root: sudo bash $0"

# ── Mode: first-install or update ─────────────────────────────────────────────
MODE="update"
if [[ ! -d "$BACKEND_DIR" || ! -d "$FRONTEND_DIR" ]]; then
  MODE="install"
fi
info "Mode: $MODE"

# =============================================================================
# SHARED HELPERS
# =============================================================================
run_as() {
  local user="$1"; shift
  su - "$user" -s /bin/bash -c "$*"
}

ensure_logs_dir() {
  local user="$1"
  local logdir="/home/${user}/logs"   # not the domain dir, user home
  # Get actual home of each service user
  case "$user" in
    "$BACKEND_USER")  logdir="/home/api.sitewatch.jaiveeru.site/logs" ;;
    "$FRONTEND_USER") logdir="/home/sitewatch.jaiveeru.site/logs" ;;
  esac
  mkdir -p "$logdir"
  chown "$user:$user" "$logdir"
}

# =============================================================================
# BACKEND DEPLOYMENT
# =============================================================================
deploy_backend() {
  section "Deploying Backend (apisi3307 / api.sitewatch.jaiveeru.site)"

  ensure_logs_dir "$BACKEND_USER"

  if [[ "$MODE" == "install" ]]; then
    info "Cloning repo into $BACKEND_DIR …"
    mkdir -p "$(dirname "$BACKEND_DIR")"
    run_as "$BACKEND_USER" "git clone $REPO_URL $BACKEND_DIR"

    # .env must exist before we continue
    if [[ ! -f "$BACKEND_APP/.env" ]]; then
      cp "$BACKEND_APP/../.env.example" "$BACKEND_APP/.env" 2>/dev/null || true
      warn ".env not found — a blank one was copied from .env.example."
      warn "Edit $BACKEND_APP/.env before the app works correctly."
    fi
  else
    info "Pulling latest code …"
    run_as "$BACKEND_USER" "cd $BACKEND_DIR && git pull origin main"
  fi

  info "Installing Node dependencies …"
  run_as "$BACKEND_USER" "cd $BACKEND_APP && npm install --omit=dev"

  info "Generating Prisma client …"
  run_as "$BACKEND_USER" "cd $BACKEND_APP && npx prisma generate"

  info "Running database migrations …"
  run_as "$BACKEND_USER" "cd $BACKEND_APP && npx prisma migrate deploy"

  info "Building TypeScript …"
  run_as "$BACKEND_USER" "cd $BACKEND_APP && npm run build"

  info "Copying PM2 ecosystem file …"
  cp "$BACKEND_APP/infrastructure/pm2/ecosystem.backend.js" \
     "/home/api.sitewatch.jaiveeru.site/ecosystem.backend.js"
  chown "$BACKEND_USER:$BACKEND_USER" \
     "/home/api.sitewatch.jaiveeru.site/ecosystem.backend.js"

  if run_as "$BACKEND_USER" "pm2 describe sitewatch-backend > /dev/null 2>&1"; then
    info "Reloading PM2 process (zero-downtime) …"
    run_as "$BACKEND_USER" "pm2 reload sitewatch-backend"
  else
    info "Starting PM2 process for the first time …"
    run_as "$BACKEND_USER" \
      "pm2 start /home/api.sitewatch.jaiveeru.site/ecosystem.backend.js && pm2 save"
    info "Enable PM2 startup (run the printed command as root once) …"
    run_as "$BACKEND_USER" "pm2 startup systemd -u $BACKEND_USER --hp /home/api.sitewatch.jaiveeru.site" || true
  fi

  info "Backend deployment complete ✓"
}

# =============================================================================
# FRONTEND DEPLOYMENT
# =============================================================================
deploy_frontend() {
  section "Deploying Frontend (sitew1875 / sitewatch.jaiveeru.site)"

  ensure_logs_dir "$FRONTEND_USER"

  if [[ "$MODE" == "install" ]]; then
    info "Cloning repo into $FRONTEND_DIR …"
    mkdir -p "$(dirname "$FRONTEND_DIR")"
    run_as "$FRONTEND_USER" "git clone $REPO_URL $FRONTEND_DIR"

    # Create .env.local for Next.js
    if [[ ! -f "$FRONTEND_APP/.env.local" ]]; then
      cat > "$FRONTEND_APP/.env.local" <<'ENVEOF'
NEXT_PUBLIC_API_URL=https://api.sitewatch.jaiveeru.site
NEXT_PUBLIC_APP_URL=https://sitewatch.jaiveeru.site
NEXT_PUBLIC_STATUS_URL=https://sites.jaiveeru.site
ENVEOF
      chown "$FRONTEND_USER:$FRONTEND_USER" "$FRONTEND_APP/.env.local"
      info "Created $FRONTEND_APP/.env.local — verify the URLs are correct."
    fi
  else
    info "Pulling latest code …"
    run_as "$FRONTEND_USER" "cd $FRONTEND_DIR && git pull origin main"
  fi

  info "Installing Node dependencies …"
  run_as "$FRONTEND_USER" "cd $FRONTEND_APP && npm install"

  info "Building Next.js …"
  run_as "$FRONTEND_USER" "cd $FRONTEND_APP && npm run build"

  info "Copying PM2 ecosystem file …"
  cp "$FRONTEND_APP/infrastructure/pm2/ecosystem.frontend.js" \
     "/home/sitewatch.jaiveeru.site/ecosystem.frontend.js"
  chown "$FRONTEND_USER:$FRONTEND_USER" \
     "/home/sitewatch.jaiveeru.site/ecosystem.frontend.js"

  if run_as "$FRONTEND_USER" "pm2 describe sitewatch-frontend > /dev/null 2>&1"; then
    info "Reloading PM2 process (zero-downtime) …"
    run_as "$FRONTEND_USER" "pm2 reload sitewatch-frontend"
  else
    info "Starting PM2 process for the first time …"
    run_as "$FRONTEND_USER" \
      "pm2 start /home/sitewatch.jaiveeru.site/ecosystem.frontend.js && pm2 save"
    info "Enable PM2 startup (run the printed command as root once) …"
    run_as "$FRONTEND_USER" "pm2 startup systemd -u $FRONTEND_USER --hp /home/sitewatch.jaiveeru.site" || true
  fi

  info "Frontend deployment complete ✓"
}

# =============================================================================
# HTACCESS PROXY FILES
# =============================================================================
deploy_htaccess() {
  section "Deploying OLS .htaccess proxy files"

  INFRA_DIR="$BACKEND_APP/infrastructure/openlitespeed"

  # sitewatch.jaiveeru.site
  cp "$INFRA_DIR/htaccess-sitewatch" \
     "/home/sitewatch.jaiveeru.site/public_html/.htaccess"
  chown "$FRONTEND_USER:$FRONTEND_USER" \
     "/home/sitewatch.jaiveeru.site/public_html/.htaccess"
  info "  ✓ sitewatch.jaiveeru.site .htaccess placed"

  # api.sitewatch.jaiveeru.site
  cp "$INFRA_DIR/htaccess-api" \
     "/home/api.sitewatch.jaiveeru.site/public_html/.htaccess"
  chown "$BACKEND_USER:$BACKEND_USER" \
     "/home/api.sitewatch.jaiveeru.site/public_html/.htaccess"
  info "  ✓ api.sitewatch.jaiveeru.site .htaccess placed"

  # sites.jaiveeru.site
  cp "$INFRA_DIR/htaccess-sites" \
     "/home/sites.jaiveeru.site/public_html/.htaccess"
  chown "sites3163:sites3163" \
     "/home/sites.jaiveeru.site/public_html/.htaccess" 2>/dev/null || \
  chown "nobody:nobody" \
     "/home/sites.jaiveeru.site/public_html/.htaccess"
  info "  ✓ sites.jaiveeru.site .htaccess placed"
}

# =============================================================================
# HEALTH CHECK
# =============================================================================
health_check() {
  section "Health Checks"
  sleep 4

  for target in "http://127.0.0.1:4000/health" "http://127.0.0.1:3000"; do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "$target" 2>/dev/null || echo "ERR")
    if [[ "$CODE" =~ ^[23] ]]; then
      info "  ✓ $target → HTTP $CODE"
    else
      warn "  ✗ $target → HTTP $CODE (check logs)"
    fi
  done
}

# =============================================================================
# SUMMARY
# =============================================================================
show_summary() {
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  JV SiteWatch — Deployment Complete"
  echo "══════════════════════════════════════════════════════════"
  echo "  Dashboard   : https://sitewatch.jaiveeru.site"
  echo "  API         : https://api.sitewatch.jaiveeru.site"
  echo "  Status Pages: https://sites.jaiveeru.site"
  echo ""
  echo "  Logs:"
  echo "    pm2 logs sitewatch-backend   (run as $BACKEND_USER)"
  echo "    pm2 logs sitewatch-frontend  (run as $FRONTEND_USER)"
  echo "══════════════════════════════════════════════════════════"
}

# =============================================================================
# MAIN
# =============================================================================
main() {
  info "Starting JV SiteWatch CyberPanel deployment ($MODE mode) …"
  deploy_backend
  deploy_frontend
  deploy_htaccess
  health_check
  show_summary
}

main "$@"
