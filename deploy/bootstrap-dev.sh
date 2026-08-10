#!/usr/bin/env bash
# Разовая подготовка dev-сервера (GCE e2-micro, 1 ГБ, us-central1). Запускается руками
# на сервере под пользователем deploy, из склонированного репозитория:
#
#   git clone --depth 1 -b dev https://github.com/azertyDev/ravonroad.git /opt/ravonroad
#   /opt/ravonroad/deploy/bootstrap-dev.sh
#
# Повторный запуск безопасен: .env не перетирается без --force. Он же обновляет
# скрипты deploy/ на сервере — сама выкатка их не трогает.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/ravonroad}
ENV_FILE="$APP_DIR/.env"
GCP_PROJECT=${GCP_PROJECT:-ravonroad-dev}
GHCR_REPO=${GHCR_REPO:-ghcr.io/azertydev/ravonroad}
PUBLIC_ORIGIN=${PUBLIC_ORIGIN:-http://34.46.68.126}
# sslip.io резолвит <ip>.sslip.io в сам ip — домен для сертификата, не покупая домен.
TLS_DOMAIN=${TLS_DOMAIN:-34.46.68.126.sslip.io}
# Экстракт карты. Имя файла содержит дату сборки: новый экстракт — новое значение здесь
# и новое значение переменной репозитория VITE_MAP_PMTILES_URL в GitHub Actions.
MAP_PMTILES_DEFAULT=https://storage.googleapis.com/ravonroad-dev-photos/map/tashkent-20260810.pmtiles
VITE_MAP_PMTILES_URL=${VITE_MAP_PMTILES_URL:-$MAP_PMTILES_DEFAULT}

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

# Секреты живут в Secret Manager проекта ravonroad-dev и в репозиторий не попадают:
# репозиторий публичный.
secret() {
  gcloud --project "$GCP_PROJECT" secrets versions access latest --secret "ravonroad-dev-$1"
}

command -v docker >/dev/null || { echo "нет docker" >&2; exit 1; }
command -v gcloud >/dev/null || { echo "нет gcloud — без него секреты не достать" >&2; exit 1; }

echo "==> каталог $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
  echo "    обновлён из git"
else
  echo "    не git-клон. Ожидается: git clone --depth 1 -b dev https://github.com/azertyDev/ravonroad.git $APP_DIR" >&2
  exit 1
fi

echo "==> проверяю compose-файлы"
for f in docker-compose.yml docker-compose.dev.yml; do
  [ -f "$APP_DIR/$f" ] || { echo "    нет $f" >&2; exit 1; }
  echo "    $f на месте"
done

if [ -f "$ENV_FILE" ] && [ "$FORCE" -eq 0 ]; then
  echo "==> $ENV_FILE уже есть, не трогаю (перезаписать: $0 --force)"
else
  # Пароль Postgres в Secret Manager не лежит: он рождается здесь и больше нигде не нужен.
  # При --force старое значение переносится в новый .env — том с данными уже
  # проинициализирован этим паролем, и подмена сломала бы аутентификацию.
  POSTGRES_PASSWORD=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENV_FILE" 2>/dev/null || true)
  if [ -n "$POSTGRES_PASSWORD" ]; then
    echo "==> пароль Postgres взят из существующего .env"
  else
    POSTGRES_PASSWORD=$(openssl rand -hex 24)
    echo "==> сгенерирован новый пароль Postgres"
  fi

  echo "==> тяну секреты из Secret Manager ($GCP_PROJECT)"
  TELEGRAM_BOT_TOKEN=$(secret telegram-bot-token)
  TELEGRAM_GROUP_CHAT_ID=$(secret telegram-group-id)
  TELEGRAM_WEBHOOK_SECRET=$(secret telegram-webhook-secret)
  S3_ACCESS_KEY_ID=$(secret s3-access-key)
  S3_SECRET_ACCESS_KEY=$(secret s3-secret-key)
  echo "    5 секретов получено"

  umask 077
  cat >"$ENV_FILE" <<EOF
# Сгенерирован deploy/bootstrap-dev.sh $(date -u +%Y-%m-%dT%H:%M:%SZ). Руками правится
# только TELEGRAM_MODERATOR_IDS; остальное перевыпускается повторным запуском --force.

NODE_ENV=production
PUBLIC_ORIGIN=$PUBLIC_ORIGIN

POSTGRES_USER=ravonroad
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=ravonroad

# Образы тянутся по тегу коммита; имена собирает deploy.sh из GHCR_REPO и IMAGE_TAG.
# IMAGE_TAG появится после первой успешной выкатки, PREVIOUS_IMAGE_TAG — после второй.
GHCR_REPO=$GHCR_REPO

# Фото на dev — Google Cloud Storage через S3-совместимый XML API, подпись SigV4.
S3_ENDPOINT=https://storage.googleapis.com
S3_REGION=us-central1
S3_BUCKET=ravonroad-dev-photos
S3_PUBLIC_BASE_URL=https://storage.googleapis.com/ravonroad-dev-photos
S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY

# Тот же адрес, из которого edge собирает connect-src своей CSP. Пусто — браузер
# заблокирует range-запросы к тайлам, и карта останется пустой при живом бандле.
VITE_MAP_PMTILES_URL=$VITE_MAP_PMTILES_URL

# https на стенде. Домен покупать не нужно: sslip.io отдаёт A-запись прямо из имени.
# Без него браузер не даёт ни геолокацию, ни crypto.randomUUID, а Telegram не принимает
# webhook. Сертификат выпускает deploy/issue-cert.sh; до первого выпуска edge работает
# по http, и это рабочее состояние, а не поломка.
TLS_DOMAIN=$TLS_DOMAIN
LETSENCRYPT_DIR=$APP_DIR/letsencrypt
CERTBOT_WEBROOT=$APP_DIR/certbot-webroot

TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_GROUP_CHAT_ID=$TELEGRAM_GROUP_CHAT_ID
TELEGRAM_WEBHOOK_SECRET=$TELEGRAM_WEBHOOK_SECRET
# telegram_user_id модераторов через запятую — первичный засев таблицы moderator (ADR-0005).
TELEGRAM_MODERATOR_IDS=
EOF
  chmod 600 "$ENV_FILE"
  echo "==> $ENV_FILE записан, права 600, владелец $(id -un)"
fi

echo "==> поднимаю базу — она же создаёт том ravonroad_db-data"
# Том создаёт compose, а не `docker volume create`: созданный руками том приходит без
# меток проекта, и compose откажется его брать, требуя external: true.
docker compose -f "$APP_DIR/docker-compose.yml" -f "$APP_DIR/docker-compose.dev.yml" \
  --project-directory "$APP_DIR" up -d db
docker volume inspect ravonroad_db-data --format '    том {{.Name}} → {{.Mountpoint}}'

cat <<'EOF'

Готово. Что осталось сделать руками:
  1. Открыть 80 порт в firewall GCE и убедиться, что 5432 наружу не смотрит.
  2. Вписать TELEGRAM_MODERATOR_IDS в /opt/ravonroad/.env.
  3. Положить публичную часть ключа deploy в ~/.ssh/authorized_keys,
     приватную — в секрет DEPLOY_SSH_KEY репозитория (плюс DEPLOY_HOST и DEPLOY_USER).
  4. Первая выкатка: push в dev, либо вручную
     /opt/ravonroad/deploy/deploy.sh <sha>
EOF
