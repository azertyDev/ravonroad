#!/usr/bin/env bash
# Выпуск и продление сертификата Let's Encrypt для стенда. Запускается НА сервере,
# руками или по расписанию:
#
#   /opt/ravonroad/deploy/issue-cert.sh
#   0 3 * * 1  /opt/ravonroad/deploy/issue-cert.sh >>/var/log/ravonroad-cert.log 2>&1
#
# Повторный запуск безопасен: `--keep-until-expiring` не трогает сертификат, которому
# осталось больше 30 дней, поэтому один и тот же вызов годится и для выпуска, и для
# продления — отдельного пути продления нет и не должно быть.
#
# Проверка владения идёт через работающий nginx: certbot кладёт файл в общий каталог,
# nginx отдаёт его по /.well-known/acme-challenge/. Останавливать стенд не нужно.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/ravonroad}
cd "$APP_DIR"

set -a
# shellcheck disable=SC1091 # путь известен только в рантайме
. ./.env
set +a

: "${TLS_DOMAIN:?TLS_DOMAIN не задан в .env}"
LETSENCRYPT_DIR=${LETSENCRYPT_DIR:-$APP_DIR/letsencrypt}
CERTBOT_WEBROOT=${CERTBOT_WEBROOT:-$APP_DIR/certbot-webroot}

mkdir -p "$LETSENCRYPT_DIR" "$CERTBOT_WEBROOT"

echo "==> сертификат для $TLS_DOMAIN"
# Без адреса почты: стенд разовый, а вписывать сюда чужой ящик ради писем об истечении
# незачем — продление и так идёт по расписанию. На проде адрес добавляется.
docker run --rm \
  -v "$LETSENCRYPT_DIR:/etc/letsencrypt" \
  -v "$CERTBOT_WEBROOT:/var/www/certbot" \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$TLS_DOMAIN" \
  --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring

echo "==> перезапускаю edge, чтобы он подхватил сертификат"
docker compose -f "$APP_DIR/docker-compose.yml" -f "$APP_DIR/docker-compose.dev.yml" \
  --project-directory "$APP_DIR" up -d --force-recreate --no-deps edge

echo "==> проверяю https"
curl -fsS --max-time 10 "https://$TLS_DOMAIN/health" && echo || {
  echo "!!! https не отвечает — смотри docker compose logs edge" >&2
  exit 1
}
