#!/usr/bin/env bash
# Суточный дамп Postgres в S3 с ротацией (SRS §10.5). Запускается из cron на проде:
#
#   17 3 * * * /opt/ravonroad/deploy/backup.sh >>/var/log/ravonroad-backup.log 2>&1
#
# Три часа ночи — не суеверие: pg_dump читает всю базу, и делать это надо тогда, когда
# 380 свободных мегабайт прода никому больше не нужны (SRS §12.1, §12.2 п.4).
#
# **Store of record — S3, а не диск сервера.** Локальные копии не переживают потерю диска,
# то есть ровно тот случай, ради которого бэкап и делается. На диске остаются две
# последних — чтобы откат после неудачной миграции не зависел от сети.
#
# Фотографии не бэкапятся: их хранилище — тот же S3, повторной загрузки исходников
# не существует (SRS §10.5).
#
# На dev cron не ставится: восстанавливать нечего (SRS §12.2 п.4). Ручной снимок —
# перед рискованной миграцией:
#
#   COMPOSE_OVERLAY=docker-compose.dev.yml /opt/ravonroad/deploy/backup.sh
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/ravonroad}
BACKUP_DIR=${BACKUP_DIR:-$APP_DIR/backups}
COMPOSE_OVERLAY=${COMPOSE_OVERLAY:-docker-compose.prod.yml}
# 14 копий — требование SRS §10.5. Две локальных — быстрый откат без сети.
KEEP_REMOTE=${KEEP_REMOTE:-14}
KEEP_LOCAL=${KEEP_LOCAL:-2}
# Отдельный префикс: бэкапы лежат в том же бакете, что фотографии, и путать их нельзя.
PREFIX=${BACKUP_PREFIX:-db-backups}

cd "$APP_DIR"
set -a
# shellcheck disable=SC1091 # .env создаётся на сервере, в репозитории его нет
. ./.env
set +a

# Без ключей скрипт обязан упасть, а не тихо сделать локальную копию: «бэкап есть»
# и «бэкап есть только на этом диске» различаются ровно в тот день, когда диска не станет.
for name in S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY; do
  [ -n "${!name:-}" ] || { echo "!!! $name не задан в $APP_DIR/.env — выгружать некуда" >&2; exit 1; }
done

compose() { docker compose -f docker-compose.yml -f "$COMPOSE_OVERLAY" "$@"; }

# S3 подписывается самим curl (--aws-sigv4). Ни aws-cli, ни второго контейнера:
# на 1 ГБ dev и 2 ГБ прода образ ради одного PUT не окупается, а curl уже стоит.
s3() {
  local method=$1 url=$2
  shift 2
  curl -sS --fail-with-body \
    --aws-sigv4 "aws:amz:${S3_REGION}:s3" \
    --user "${S3_ACCESS_KEY_ID}:${S3_SECRET_ACCESS_KEY}" \
    -X "$method" "$url" "$@"
}

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%d-%H%M%S)
NAME="db-$STAMP.sql.gz"
TARGET="$BACKUP_DIR/$NAME"

echo "==> дамп в $TARGET"
# exec в работающий контейнер, а не отдельный: лишний контейнер под 1 ГБ не влезает.
# Пишем во временный файл и переименовываем — оборванный дамп не должен попасть
# в ротацию и вытеснить из неё живую копию.
compose exec -T db \
  pg_dump -U "${POSTGRES_USER:-ravonroad}" -d "${POSTGRES_DB:-ravonroad}" \
  | gzip -c >"$TARGET.part"
mv "$TARGET.part" "$TARGET"
echo "    $(du -h "$TARGET" | cut -f1)"

echo "==> выгружаю в s3://$S3_BUCKET/$PREFIX/$NAME"
# -T, а не --data-binary: файл уходит потоком и не читается в память целиком.
curl -sS --fail-with-body \
  --aws-sigv4 "aws:amz:${S3_REGION}:s3" \
  --user "${S3_ACCESS_KEY_ID}:${S3_SECRET_ACCESS_KEY}" \
  -T "$TARGET" "$S3_ENDPOINT/$S3_BUCKET/$PREFIX/$NAME" >/dev/null
echo "    загружено"

echo "==> ротация в S3: оставляю $KEEP_REMOTE последних"
# Ключи содержат отметку времени в сортируемом виде, поэтому лексикографический порядок
# ответа S3 и есть хронологический — сортировать по LastModified незачем.
# Пагинации нет намеренно: за первой тысячей ключей нам делать нечего, а до неё
# ротация не даст дорасти.
REMOTE=$(s3 GET "$S3_ENDPOINT/$S3_BUCKET?list-type=2&prefix=$PREFIX/db-" \
  | grep -o '<Key>[^<]*</Key>' | sed 's|</\?Key>||g' | sort)
TOTAL=$(printf '%s\n' "$REMOTE" | grep -c . || true)
if [ "$TOTAL" -gt "$KEEP_REMOTE" ]; then
  printf '%s\n' "$REMOTE" | head -n "$((TOTAL - KEEP_REMOTE))" | while read -r old; do
    [ -n "$old" ] || continue
    s3 DELETE "$S3_ENDPOINT/$S3_BUCKET/$old" >/dev/null
    echo "    удалён $old"
  done
fi
# grep -o, а не grep -c: ответ S3 приходит одной строкой, и `-c` посчитал бы строки,
# то есть всегда единицу.
echo "==> копий в S3: $(s3 GET "$S3_ENDPOINT/$S3_BUCKET?list-type=2&prefix=$PREFIX/db-" | grep -o '<Key>' | wc -l | tr -d ' ')"

echo "==> ротация на диске: оставляю $KEEP_LOCAL последних"
# shellcheck disable=SC2012
ls -1t "$BACKUP_DIR"/db-*.sql.gz | tail -n "+$((KEEP_LOCAL + 1))" | while read -r old; do
  rm -f -- "$old"
  echo "    удалён $(basename "$old")"
done
echo "==> копий на диске: $(find "$BACKUP_DIR" -name 'db-*.sql.gz' | wc -l | tr -d ' ')"
