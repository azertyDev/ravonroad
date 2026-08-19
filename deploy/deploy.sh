#!/usr/bin/env bash
# Выкатка на сервер. Запускается НА сервере, из GitHub Actions по ssh или руками:
#
#   /opt/ravonroad/deploy/deploy.sh <image-tag>
#
# Тег — sha коммита, а не `latest`: иначе по имени образа нельзя сказать, что развёрнуто.
# Образы приезжают из GHCR готовыми, `docker build` на 1 ГБ запрещён (SRS §12.2 п.1).
#
# Механизм отката — PREVIOUS_IMAGE_TAG в .env: перед подъёмом нового кода туда
# складывается тег, который работал до этого. Если health-check не прошёл, скрипт сам
# возвращается на него.
set -euo pipefail

APP_DIR=${APP_DIR:-/opt/ravonroad}
ENV_FILE="$APP_DIR/.env"
HEALTH_URL=${HEALTH_URL:-http://localhost/health}
HEALTH_TRIES=12
HEALTH_DELAY=5

TAG=${1:-}
if [ -z "$TAG" ]; then
  echo "usage: $0 <image-tag>   (например: $0 $(git -C "$APP_DIR" rev-parse HEAD 2>/dev/null || echo 4f2a91c))" >&2
  exit 2
fi

cd "$APP_DIR"
[ -f "$ENV_FILE" ] || { echo "нет $ENV_FILE — сервер не подготовлен, сначала deploy/bootstrap-dev.sh" >&2; exit 1; }

set -a
# shellcheck disable=SC1090 # путь известен только в рантайме
. "$ENV_FILE"
set +a
: "${GHCR_REPO:?GHCR_REPO не задан в .env}"
# Оверлей лимитов задаётся явно и значения по умолчанию не имеет. Угаданный неверно,
# он тихо поднимает прод с dev-лимитами (api в 256 МБ на восьмигигабайтной машине)
# или dev с прод-лимитами (1312 МБ там, где доступно 604) — в первом случае деградация
# без единой ошибки в логе, во втором OOM. Пишется в .env при подготовке сервера.
: "${COMPOSE_OVERLAY:?COMPOSE_OVERLAY не задан в .env: docker-compose.prod.yml или docker-compose.dev.yml}"

compose() { docker compose -f docker-compose.yml -f "$COMPOSE_OVERLAY" "$@"; }

# Правит переменную в .env на месте: значение либо заменяется, либо дописывается.
# Ключи здесь только свои, из этого же скрипта, поэтому экранирование не нужно.
set_env() {
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
  fi
}

use_tag() {
  export IMAGE_TAG="$1"
  export API_IMAGE="$GHCR_REPO-api:$1"
  export EDGE_IMAGE="$GHCR_REPO-edge:$1"
  export MIGRATE_IMAGE="$GHCR_REPO-migrate:$1"
}

# Три образа подряд, а не разом: `docker compose pull` тянет параллельно, а распаковка
# трёх слоёв одновременно на e2-micro не во что положить — при 560 МБ лимитов и ~604 МБ
# доступных запас всего ~44 МБ, и параллельный pull поверх работающего стека уводит
# машину в swap (SRS §12.2). Порядок — migrate первым: он нужен раньше остальных.
pull_images() {
  for service in migrate api edge; do
    echo "==> pull $service"
    compose pull "$service"
  done
}

# Образы тегируются sha коммита, поэтому каждая выкатка приносит три новых и ни одного
# не убирает. За день это десятки гигабайт: диск стенда кончился на 65 образах, Postgres
# упал с `No space left on device` и ушёл в цикл восстановления — то есть сайт лёг
# не от нагрузки и не от кода, а от выкаток.
#
# `until=72h` оставляет свежие образы нетронутыми: цель отката переживает несколько
# выкаток подряд. Даже если её всё-таки уберут, откат сначала делает `pull_images` —
# он вернёт её из GHCR, просто медленнее.
#
# Чистка идёт ДО pull: место нужно как раз для новых слоёв. Ошибка чистки не роняет
# выкатку — свободного места могло хватить и так.
prune_images() {
  echo "==> чищу образы старше 72 часов"
  docker image prune -af --filter 'until=72h' 2>&1 | tail -1 || true
  df -h / | tail -1
}

health_ok() {
  echo "==> health-check $HEALTH_URL ($HEALTH_TRIES попыток по ${HEALTH_DELAY}с)"
  for i in $(seq 1 "$HEALTH_TRIES"); do
    if curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; then
      echo "    попытка $i: живой"
      return 0
    fi
    echo "    попытка $i: пока нет"
    sleep "$HEALTH_DELAY"
  done
  return 1
}

PREVIOUS=${IMAGE_TAG:-}

echo "==> выкатываю $TAG (предыдущий: ${PREVIOUS:-нет})"

# Compose-файлы обязаны соответствовать выкатываемому коду: лимиты памяти и переменные
# меняются вместе с ним. Без этой синхронизации новый образ поднимался бы под конфигом
# произвольной давности, и «развёрнут <sha>» было бы неправдой.
# Сами скрипты deploy/ здесь не обновляются: git переписал бы файл, который в этот
# момент исполняется, и bash дочитал бы его с середины. Скрипты обновляет bootstrap.
echo "==> синхронизирую compose-файлы с $TAG"
git fetch --depth 1 origin "$TAG"
git checkout FETCH_HEAD -- docker-compose.yml "$COMPOSE_OVERLAY"

use_tag "$TAG"
prune_images
pull_images

# Сначала миграции, потом код: новый код рассчитывает на новую схему, обратный порядок
# оставил бы окно, в котором он работает по старой. Только `prisma migrate deploy` —
# `db push` и `migrate reset` запрещены на любой среде (CLAUDE.md, SRS §13).
echo "==> миграции"
compose run --rm migrate

echo "==> поднимаю api и web ($TAG)"
compose up -d --force-recreate --no-deps api edge

if health_ok; then
  # Тег записывается в .env только после успешного health-check: иначе следующий откат
  # вернулся бы на версию, которая сама не поднялась.
  #
  # Повторная выкатка того же тега цель отката не трогает. Иначе ретрай после сетевого
  # сбоя — или вторая выкатка dev подряд — записывал бы PREVIOUS_IMAGE_TAG = IMAGE_TAG,
  # и откат становился бы пустой операцией ровно тогда, когда он нужен. Наблюдалось
  # на стенде: обе переменные показывали один и тот же sha.
  # `if`, а не `[ … ] && …`: AND-список с ложным условием возвращает 1, и `set -e`
  # уронил бы скрипт на первой же выкатке, где откатываться ещё не на что.
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$TAG" ]; then
    set_env PREVIOUS_IMAGE_TAG "$PREVIOUS"
  fi
  set_env IMAGE_TAG "$TAG"
  echo "==> готово: развёрнут $TAG"
  exit 0
fi

echo "!!! health-check не прошёл на $TAG" >&2

if [ -z "$PREVIOUS" ]; then
  echo "!!! откатываться некуда: это первая выкатка, в .env нет IMAGE_TAG." >&2
  echo "!!! стек оставлен как есть — смотри логи: docker compose logs --tail=200 api edge" >&2
  exit 1
fi

echo "==> откатываюсь на $PREVIOUS"
use_tag "$PREVIOUS"
pull_images
# Миграции при откате не отыгрываются: они только вперёд. Откат кода поверх уже накатанной
# схемы работает, пока миграция обратно совместима (SRS §13) — если нет, чинится вперёд,
# новым коммитом.
compose up -d --force-recreate --no-deps api edge

if health_ok; then
  echo "!!! выкатка $TAG провалена, стек работает на $PREVIOUS. Схема БД осталась новой." >&2
  exit 1
fi

echo "!!! откат на $PREVIOUS тоже не поднялся — стек лежит, нужен человек." >&2
echo "!!! логи: docker compose -f docker-compose.yml -f $COMPOSE_OVERLAY logs --tail=200" >&2
exit 1
