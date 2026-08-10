#!/bin/sh
# Включает TLS-сервер, если сертификат для TLS_DOMAIN уже лежит в /etc/letsencrypt.
# Запускается штатным entrypoint официального образа nginx до старта самого nginx.
#
# Зачем условие: до первого выпуска сертификата файлов нет, и server-блок с
# ssl_certificate уронил бы nginx на старте — а именно через работающий nginx ACME
# и проверяет домен. Поэтому без сертификата контейнер работает по http, с
# сертификатом — добавляет 443. Оба состояния рабочие, ручного шага между ними нет.
set -eu

TLS_DIR=/etc/nginx/conf.d/tls
mkdir -p "$TLS_DIR"

if [ -z "${TLS_DOMAIN:-}" ]; then
  echo "20-enable-tls: TLS_DOMAIN не задан, остаюсь на http"
  exit 0
fi

CERT="/etc/letsencrypt/live/${TLS_DOMAIN}/fullchain.pem"
if [ ! -f "$CERT" ]; then
  echo "20-enable-tls: нет сертификата для ${TLS_DOMAIN}, остаюсь на http"
  exit 0
fi

envsubst '$TLS_DOMAIN' </etc/nginx/tls-available/tls.conf.template >"$TLS_DIR/tls.conf"
echo "20-enable-tls: TLS включён для ${TLS_DOMAIN}"
