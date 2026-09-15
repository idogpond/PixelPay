#!/bin/sh
set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="pixelpay_${TIMESTAMP}.sql"
S3_PATH="s3://${S3_BUCKET}/db-backups/${BACKUP_FILE}"

trap 'rm -f "/tmp/${BACKUP_FILE}"' EXIT

echo "Starting backup: ${BACKUP_FILE}"

# Requires MYSQL_PWD env var to be set (provided by docker-compose via environment)
mysqldump \
  --host="${DB_HOST}" \
  --port="${DB_PORT:-3306}" \
  --user="${DB_USER}" \
  --single-transaction \
  --routines \
  "${DB_NAME}" > "/tmp/${BACKUP_FILE}"

aws s3 cp "/tmp/${BACKUP_FILE}" "${S3_PATH}" \
  --endpoint-url "${S3_ENDPOINT}" \
  --no-progress

rm "/tmp/${BACKUP_FILE}"

# Prune backups older than 30 days
CUTOFF=$(date -d '30 days ago' +%Y%m%d 2>/dev/null || date -v-30d +%Y%m%d)
aws s3 ls "s3://${S3_BUCKET}/db-backups/" \
  --endpoint-url "${S3_ENDPOINT}" \
  | awk '{print $4}' \
  | while read -r file; do
      # Only prune files matching our backup naming pattern
      case "$file" in
        pixelpay_*)
          file_date=$(echo "$file" | grep -oE '[0-9]{8}' | head -1)
          if [ -n "$file_date" ] && [ "$file_date" -lt "$CUTOFF" ]; then
            aws s3 rm "s3://${S3_BUCKET}/db-backups/${file}" \
              --endpoint-url "${S3_ENDPOINT}"
            echo "Deleted old backup: ${file}"
          fi
          ;;
      esac
    done

echo "Backup complete: ${S3_PATH}"
