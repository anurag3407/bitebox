#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <path_to_backup.sql.gz> <target_database_url>"
  echo "Example: $0 /var/backups/bitebox/bitebox_db_20261019_040000Z.sql.gz postgresql://postgres:postgres@localhost:5432/bitebox_recovery"
  echo ""
  echo "CRITICAL SAFETY RULE (plan.md Section 23.8):"
  echo "Always restore into an isolated quarantine database first to reconcile"
  echo "payments, physical deliveries, and stale background worker jobs."
  exit 1
fi

BACKUP_PATH="$1"
TARGET_DB_URL="$2"

if [ ! -f "$BACKUP_PATH" ]; then
  echo "[-] ERROR: Backup file not found at $BACKUP_PATH"
  exit 1
fi

echo "=========================================================="
echo " QUARANTINE RESTORATION CHECKPOINT"
echo " Target DB: $TARGET_DB_URL"
echo " Backup File: $BACKUP_PATH"
echo "=========================================================="

read -p "Are you sure you want to restore to the specified target database? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Restoration aborted by operator."
  exit 0
fi

echo "[1/3] Decompressing and restoring to target database..."
gunzip -c "$BACKUP_PATH" | pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$TARGET_DB_URL"

echo "[2/3] Verifying database schema and record counts..."
psql "$TARGET_DB_URL" -c "SELECT count(*) AS total_orders FROM orders;"
psql "$TARGET_DB_URL" -c "SELECT count(*) AS total_ledger_entries FROM ledger_entries;"

echo "[3/3] Target restored into quarantine!"
echo "Next steps for recovery:"
echo "1. Audit payment provider transactions against restored orders."
echo "2. Check jobs table for stale jobs restored in RUNNING state."
echo "3. Execute runbooks/backup-restore.md recovery reconciliation protocol."
