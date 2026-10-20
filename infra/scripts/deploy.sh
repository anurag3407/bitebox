#!/usr/bin/env bash
# Release on the VPS: build images, migrate, roll services, verify readiness.
# Tests run in CI (against a disposable database), never against production.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$APP_DIR"
COMPOSE=(docker compose --env-file .env -f infra/compose/docker-compose.yml)
export RELEASE="${RELEASE:-$(git rev-parse --short HEAD)}"

if [ ! -f ".env" ]; then
  echo "[-] .env not found. Copy .env.example to .env and fill in production secrets." >&2
  exit 1
fi
if ! grep -q '^APP_ENV=production' .env; then
  echo "[-] .env must set APP_ENV=production (enables the insecure-config guard)." >&2
  exit 1
fi

PREVIOUS="$(docker image inspect startup-web:latest --format '{{.Id}}' 2>/dev/null || true)"

echo "[1/4] Building images for release ${RELEASE}..."
"${COMPOSE[@]}" build

echo "[2/4] Applying database migrations..."
# Migrations are additive/idempotent; the advisory lock serialises concurrent runners
"${COMPOSE[@]}" run --rm migrate

echo "[3/4] Rolling services..."
"${COMPOSE[@]}" up -d --remove-orphans web worker nginx

echo "[4/4] Waiting for readiness..."
for attempt in $(seq 1 40); do
  if "${COMPOSE[@]}" exec -T web wget -qO- http://127.0.0.1:3000/api/v1/health/ready 2>/dev/null | grep -q '"status":"ready"'; then
    docker tag "startup-web:${RELEASE}" startup-web:latest
    docker tag "startup-worker:${RELEASE}" startup-worker:latest
    echo "[+] Release ${RELEASE} is live."
    exit 0
  fi
  sleep 3
done

echo "[-] Readiness check failed for ${RELEASE}. Recent logs:" >&2
"${COMPOSE[@]}" logs --tail=80 web worker >&2
if [ -n "$PREVIOUS" ]; then
  echo "[-] Rolling back web/worker to the previous images (schema changes are backward compatible)." >&2
  RELEASE=latest "${COMPOSE[@]}" up -d --no-build web worker
fi
exit 1
