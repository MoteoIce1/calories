#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@api.moteotracker.ru}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/moteotracker-api}"

echo "→ Sync api/ to $DEPLOY_HOST:$DEPLOY_PATH"
rsync -az \
  --exclude node_modules \
  --exclude .env \
  --exclude '.git' \
  --exclude '*.backup*' \
  --exclude 'server.js.broken*' \
  "$ROOT_DIR/" "$DEPLOY_HOST:$DEPLOY_PATH/"

echo "→ Install deps and restart service"
ssh "$DEPLOY_HOST" "cd '$DEPLOY_PATH' && npm ci --omit=dev && pm2 restart moteotracker-api"

sleep 2

echo "→ Smoke test"
curl -fsS "https://api.moteotracker.ru:8443/health" >/dev/null
curl -fsS -X POST "https://api.moteotracker.ru:8443/api/ai/estimate-food" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Хурма"}' | grep -q 'caloriesPer100g'

echo "Done."
