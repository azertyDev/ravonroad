#!/usr/bin/env bash
# Разовая подготовка прод-сервера (Contabo Cloud VPS 4: 4 vCPU, 8 ГБ, 100 ГБ SSD).
# Запускается руками на сервере под пользователем deploy:
#
#   git clone --depth 1 -b dev https://github.com/azertyDev/ravonroad.git /opt/ravonroad
#   TELEGRAM_BOT_TOKEN=… TELEGRAM_GROUP_CHAT_ID=… TELEGRAM_WEBHOOK_SECRET=… \
#   TLS_DOMAIN=169.58.202.96.sslip.io \
#   /opt/ravonroad/deploy/bootstrap-prod.sh
#
# Почему не bootstrap-dev.sh: тот берёт секреты из Secret Manager проекта ravonroad-dev,
# а у Contabo своего GCP нет. Здесь секреты приходят из окружения того, кто запускает,
# и в истории команд им делать нечего — набирайте с ведущим пробелом либо через `env -i`.
#
# Повторный запуск безопасен: .env не перетирается без --force. Он же обновляет скрипты
# deploy/ на сервере — сама выкатка их не трогает, потому что git переписал бы файл,
# который в этот момент исполняется.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/ravonroad}
ENV_FILE="$APP_DIR/.env"
GHCR_REPO=${GHCR_REPO:-ghcr.io/azertydev/ravonroad}
TLS_DOMAIN=${TLS_DOMAIN:-}
# Три адреса из разных ролей, и путать их дорого (docs/deploy.md). По умолчанию все три
# выводятся из TLS_DOMAIN: пока домена кампании нет, это имя вида <ip>.sslip.io.
PUBLIC_ORIGIN=${PUBLIC_ORIGIN:-https://$TLS_DOMAIN}
PUBLIC_SITE_URL=${PUBLIC_SITE_URL:-https://$TLS_DOMAIN}

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

command -v docker >/dev/null || { echo "!!! docker не установлен" >&2; exit 1; }

# Без TLS_DOMAIN не будет ни webhook Telegram, ни геолокации в браузере: и то и другое
# требует защищённого контекста. Пустое значение здесь тише всего ломает прод.
: "${TLS_DOMAIN:?TLS_DOMAIN не задан: без https не работают ни форма, ни модерация}"

# Telegram обязателен: без него api не поднимается вовсе — молча копить карточки хуже,
# чем упасть на старте (SRS §10.1). S3 здесь НЕ проверяется: с переездом фотографий
# на диск (ADR-0009) ключи нужны только deploy/backup.sh, и прод поднимается без них.
for name in TELEGRAM_BOT_TOKEN TELEGRAM_GROUP_CHAT_ID TELEGRAM_WEBHOOK_SECRET; do
  [ -n "${!name:-}" ] || { echo "!!! $name не задан в окружении" >&2; exit 1; }
done

echo "==> каталог $APP_DIR"
[ -d "$APP_DIR/.git" ] || {
  echo "!!! $APP_DIR не git-клон. Ожидается:" >&2
  echo "    git clone --depth 1 -b dev https://github.com/azertyDev/ravonroad.git $APP_DIR" >&2
  exit 1
}
git -C "$APP_DIR" pull --ff-only
echo "    обновлён из git"

echo "==> проверяю compose-файлы"
for f in docker-compose.yml docker-compose.prod.yml; do
  [ -f "$APP_DIR/$f" ] || { echo "!!! нет $f" >&2; exit 1; }
  echo "    $f на месте"
done

if [ -f "$ENV_FILE" ] && [ "$FORCE" -eq 0 ]; then
  echo "==> $ENV_FILE уже есть, не трогаю (перезаписать: $0 --force)"
else
  # Пароль Postgres рождается здесь и больше нигде не нужен, поэтому в окружение
  # не передаётся. При --force старое значение переносится: том уже проинициализирован
  # этим паролем, и подмена сломала бы аутентификацию.
  POSTGRES_PASSWORD=$(sed -n 's/^POSTGRES_PASSWORD=//p' "$ENV_FILE" 2>/dev/null || true)
  if [ -n "$POSTGRES_PASSWORD" ]; then
    echo "==> пароль Postgres взят из существующего .env"
  else
    POSTGRES_PASSWORD=$(openssl rand -hex 24)
    echo "==> сгенерирован новый пароль Postgres"
  fi

  umask 077
  cat >"$ENV_FILE" <<EOF
# Сгенерирован deploy/bootstrap-prod.sh $(date -u +%Y-%m-%dT%H:%M:%SZ). Руками правятся
# TELEGRAM_MODERATOR_IDS, TELEGRAM_ALERT_CHAT_ID и ключи S3 для резервных копий;
# остальное перевыпускается повторным запуском с --force.

NODE_ENV=production
# Какой оверлей лимитов брать. У deploy.sh значения по умолчанию нет намеренно:
# перепутанный оверлей ломает машину тихо (SRS §12.1, §12.2).
COMPOSE_OVERLAY=docker-compose.prod.yml
PUBLIC_ORIGIN=$PUBLIC_ORIGIN
# Адрес сайта в ссылках карточек бота и в адресах фотографий (ADR-0009). То же имя,
# что у сертификата ниже: иначе волонтёр получит предупреждение браузера вместо заявки.
PUBLIC_SITE_URL=$PUBLIC_SITE_URL

POSTGRES_USER=ravonroad
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=ravonroad

# Образы тянутся по тегу коммита; имена собирает deploy.sh из GHCR_REPO и IMAGE_TAG.
# IMAGE_TAG появится после первой успешной выкатки, PREVIOUS_IMAGE_TAG — после второй.
GHCR_REPO=$GHCR_REPO

# Фотографии лежат на диске, в томе photos (ADR-0009). Это точка монтирования внутри
# контейнера, а не путь на хосте.
MEDIA_ROOT=/var/lib/ravonroad/photos

# Резервные копии: дампы базы и ночная копия фотографий (deploy/backup.sh, SRS §10.5).
# Приложение эти ключи не читает. Пустые значения означают, что копий нет вовсе —
# на проде это состояние допустимо только до анонса.
S3_ENDPOINT=https://storage.googleapis.com
S3_REGION=us-central1
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# https. Сертификат выпускает deploy/issue-cert.sh; до первого выпуска edge работает
# по http, и это временное состояние: без защищённого контекста нет ни webhook, ни гео.
TLS_DOMAIN=$TLS_DOMAIN
LETSENCRYPT_DIR=$APP_DIR/letsencrypt
CERTBOT_WEBROOT=$APP_DIR/certbot-webroot

TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_GROUP_CHAT_ID=$TELEGRAM_GROUP_CHAT_ID
TELEGRAM_WEBHOOK_SECRET=$TELEGRAM_WEBHOOK_SECRET
# telegram_user_id модераторов через запятую — первичный засев таблицы moderator (ADR-0005).
TELEGRAM_MODERATOR_IDS=
# Приватный чат координатора для алертов (SRS §10.4). Пусто — алерты выключены,
# и api говорит об этом на старте.
TELEGRAM_ALERT_CHAT_ID=
EOF
  chmod 600 "$ENV_FILE"
  echo "==> $ENV_FILE записан, права 600, владелец $(id -un)"
fi

echo "==> поднимаю базу — она же создаёт том ravonroad_db-data"
# Том создаёт compose, а не `docker volume create`: созданный руками том приходит без
# меток проекта, и compose откажется его брать, требуя external: true.
docker compose -f "$APP_DIR/docker-compose.yml" -f "$APP_DIR/docker-compose.prod.yml" \
  --project-directory "$APP_DIR" up -d db
docker volume inspect ravonroad_db-data --format '    том {{.Name}} → {{.Mountpoint}}'

cat <<'ENDMSG'

Готово. Что осталось руками:
  1. TELEGRAM_MODERATOR_IDS и TELEGRAM_ALERT_CHAT_ID в /opt/ravonroad/.env.
  2. Ключи S3 в том же файле — без них deploy/backup.sh откажется работать,
     а до его первого прогона копий фотографий не существует вовсе (SRS §10.5).
  3. Публичная часть ключа deploy — в ~/.ssh/authorized_keys, приватная — в секреты
     репозитория: PROD_SSH_KEY, PROD_SSH_HOST, PROD_SSH_USER.
  4. Первая выкатка: Actions → deploy-prod → Run workflow → полный sha (40 символов).
     Откатываться ей некуда: PREVIOUS_IMAGE_TAG пуст, и при провале стек останется
     лежать с понятным сообщением.
  5. После первой выкатки — deploy/issue-cert.sh, затем cron продления (docs/deploy.md).
ENDMSG
