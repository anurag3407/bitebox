#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/zomatofresh}"
TIMESTAMP="$(date -u +"%Y%m%d_%H%M%SZ")"
BACKUP_FILE="${BACKUP_DIR}/zomatofresh_db_${TIMESTAMP}.sql.gz"
METADATA_FILE="${BACKUP_DIR}/zomatofresh_db_${TIMESTAMP}.meta.json"

mkdir -p "$BACKUP_DIR"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[-] ERROR: DATABASE_URL environment variable is not set."
  exit 1
fi

echo "[1/3] Initiating PostgreSQL snapshot..."
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges | gzip > "$BACKUP_FILE"

FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[2/3] Snapshot created: $BACKUP_FILE ($FILE_SIZE)"

# Generate audit metadata
cat <<EOF > "$METADATA_FILE"
{
  "timestamp": "${TIMESTAMP}",
  "file": "${BACKUP_FILE}",
  "size": "${FILE_SIZE}",
  "format": "pg_dump_custom_gzipped",
  "created_by": "backup.sh"
}
EOF

echo "[3/3] Pruning backups older than 14 days..."
find "$BACKUP_DIR" -name "zomatofresh_db_*.sql.gz" -mtime +14 -delete
find "$BACKUP_DIR" -name "zomatofresh_db_*.meta.json" -mtime +14 -delete

echo "Backup completed successfully."
