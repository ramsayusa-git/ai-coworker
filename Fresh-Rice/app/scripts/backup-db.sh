#!/usr/bin/env bash
# Nightly PostgreSQL dump, keeps 14 days. Add to crontab: 30 2 * * * /path/to/app/scripts/backup-db.sh
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"; mkdir -p "$DIR"
source "$(dirname "$0")/../.env" 2>/dev/null || true
URL="${DATABASE_URL:-postgresql://freshrice:freshrice@127.0.0.1:5432/freshrice}"
pg_dump "$URL" -Fc -f "$DIR/freshrice-$(date +%F).dump"
find "$DIR" -name 'freshrice-*.dump' -mtime +14 -delete
echo "backup written: $DIR/freshrice-$(date +%F).dump"
