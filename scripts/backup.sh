#!/bin/bash
# Dumps the whatsapp_codes database and deletes dumps older than RETENTION_DAYS.
# Scheduled via host crontab, not run by the app itself. See README for setup.
set -euo pipefail

cd "$(dirname "$0")/.."

BACKUP_DIR="./backups"
RETENTION_DAYS=7
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

docker compose exec -T postgres pg_dump -U postgres whatsapp_codes | gzip > "$BACKUP_DIR/whatsapp_codes_${TIMESTAMP}.sql.gz"

find "$BACKUP_DIR" -name 'whatsapp_codes_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
