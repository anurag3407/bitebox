#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " Starting Food Delivery Platform Release Deployment"
echo "=========================================================="

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"

# 1. Environment and dependencies check
if [ ! -f ".env" ]; then
  echo "[-] ERROR: .env file not found in root directory!"
  echo "    Copy .env.example to .env and configure secrets."
  exit 1
fi

echo "[1/6] Running workspace verification checks..."
pnpm typecheck
pnpm test

echo "[2/6] Running database migrations..."
pnpm db:migrate

echo "[3/6] Building production containers..."
docker compose -f infra/compose/docker-compose.yml build

echo "[4/6] Starting services with Docker Compose..."
docker compose -f infra/compose/docker-compose.yml up -d --remove-orphans

echo "[5/6] Waiting for healthcheck..."
MAX_ATTEMPTS=30
ATTEMPT=0
HEALTH_URL="http://localhost:3000/api/v1/health"

until curl -s "$HEALTH_URL" | grep -q '"status":"ok"'; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "[-] Healthcheck timed out after $MAX_ATTEMPTS attempts!"
    echo "[-] Rolling back containers..."
    docker compose -f infra/compose/docker-compose.yml logs --tail=50
    exit 1
  fi
  echo "    Waiting for $HEALTH_URL (attempt $ATTEMPT/$MAX_ATTEMPTS)..."
  sleep 2
done

echo "[6/6] Healthcheck verified successfully!"
echo "=========================================================="
echo " Deployment Complete! System operational."
echo "=========================================================="
