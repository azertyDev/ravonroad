#!/usr/bin/env bash
# Суточный дамп Postgres с ротацией. Запускается из cron на сервере:
#
#   17 3 * * * /opt/ravonroad/deploy/backup.sh >>/var/log/ravonroad-backup.log 2>&1
#
# Фотографии не бэкапятся: их хранилище — S3 (GCS на dev, Cloupard на проде), реплики
# держит оно (SRS §10.5).
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/ravonroad}
BACKUP_DIR=${BACKUP_DIR:-$APP_DIR/backups}
KEEP=${KEEP:-7}

cd "$APP_DIR"
set -a
# shellcheck disable=SC1091 # .env создаётся на сервере, в репозитории его нет
. ./.env
set +a

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%d-%H%M%S)
TARGET="$BACKUP_DIR/db-$STAMP.sql.gz"

echo "==> дамп в $TARGET"
# exec в работающий контейнер, а не отдельный: лишний контейнер под 1 ГБ не влезает.
# Пишем во временный файл и переименовываем — оборванный дамп не должен попасть
# в ротацию и вытеснить из неё живую копию.
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T db \
  pg_dump -U "${POSTGRES_USER:-ravonroad}" -d "${POSTGRES_DB:-ravonroad}" \
  | gzip -c >"$TARGET.part"
mv "$TARGET.part" "$TARGET"
echo "    $(du -h "$TARGET" | cut -f1)"

echo "==> ротация: оставляю $KEEP последних"
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/db-*.sql.gz | tail -n "+$((KEEP + 1))" | while read -r old; do
  rm -f -- "$old"
  echo "    удалён $(basename "$old")"
done

echo "==> копий на диске: $(find "$BACKUP_DIR" -name 'db-*.sql.gz' | wc -l | tr -d ' ')"
