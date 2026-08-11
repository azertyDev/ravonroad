# Наблюдаемость: как узнать о поломке раньше жителя

Срез 006 (`specs/006-observability/`). Ни одного нового контейнера: логи — stdout,
метрики — файл SQL, алерты — тот же бот. Prometheus и Grafana не разворачиваются:
~250 МБ памяти при бюджете SRS §12 — цена несоразмерная.

## Найти запрос по идентификатору

Житель называет `correlationId` с экрана ошибки. Он же возвращается в заголовке
`X-Request-Id` и стоит в теле любой ошибки API (SRS §8.1, §8.3).

```sh
cd /opt/ravonroad
C="docker compose -f docker-compose.yml -f docker-compose.dev.yml"   # на проде: prod
$C logs --no-log-prefix api  | grep 01KZQQVXD2HXECJC8AQJA12VZR
$C logs --no-log-prefix edge | grep 01KZQQVXD2HXECJC8AQJA12VZR
```

В логе `edge` — строка запроса целиком: маршрут, код, время. В логе `api` — события,
которые этот запрос породил. Идентификатор один и тот же: nginx пишет `X-Request-Id`
из ответа api, а не свой `$request_id`.

Весь поток `api` — JSON, один объект на строку, включая сообщения самого Nest:

```sh
$C logs --no-log-prefix api | jq -c 'select(.level != "info")'
$C logs --no-log-prefix api | jq -c 'select(.msg == "queue_depth")' | tail -5
```

Для апдейтов Telegram роль correlation id играет `update_id`: своего заголовка
у Telegram нет, а `update_id` называет ровно ту доставку, которая привела к событию.

**Чего в логах нет никогда** (SRS §8.4): `tracking_token`, телефон, Telegram-ник
заявителя, полный IP (только `/24`), содержимое фото, тело `multipart`. Держится это
не чек-листом ревью, а тремя механизмами: закрытый тип `LogFields` (падает
на `pnpm typecheck`), `redact` поверх свободного текста от внешних систем и тест
`src/common/logger.test.ts`, который читает исходники и падает на новой строке лога
с запретным значением. Путь `/api/track/<token>` маскируется в `access_log` nginx —
адрес страницы отслеживания и есть токен.

## Двенадцать обязательных событий (SRS §10.2)

`report_created`, `report_rejected_geofence`, `report_rate_flagged`, `status_changed`,
`status_undone`, `unauthorized_button_press`, `webhook_auth_failed`, `photo_rejected`,
`outbox_send_failed`, `telegram_unavailable`, `contacts_deleted`, `db_unavailable`.

Список закрыт тестом: пропавшее при рефакторинге событие иначе обнаруживается в тот день,
когда оно понадобилось.

## Проверки живости

| Адрес | Что проверяет | Ответ |
| --- | --- | --- |
| `GET /health` | процесс жив | `200` всегда, пока работает api |
| `GET /ready` | `SELECT 1` к БД, таймаут 2 с | `200` / `503 {"db":"down"}` |
| `GET /health/details` | БД, S3, webhook, глубины очередей, возраст апдейта | `200` со сводкой |

Все три — **вне** префикса `/api` и с точным `location` в nginx. Без точного совпадения
адрес проваливается в SPA-fallback, и внешний пинг получает `index.html` с кодом `200`
при мёртвом api. Проверено остановкой контейнера: `/health` и `/ready` отдают `502`,
а `/` продолжает отдавать статику с `200`.

`/ready` намеренно смотрит **только** на БД: сайт обязан работать при недоступном
Telegram и продолжает отдавать карту при недоступном S3. Их состояние видно
в `/health/details` — и только там.

```sh
curl -s https://<host>/health/details | jq
```

Секретов и персональных данных в ответе нет, поэтому он открыт без авторизации: заводить
единственный в системе секрет ради страницы диагностики несоразмерно (SRS §10.1).
Проверки S3 и Telegram кэшируются на 60 секунд, иначе страница диагностики сама стала бы
нагрузкой на внешние сервисы.

## Глубины очередей

Событие `queue_depth` пишут оба воркера, не чаще раза в минуту (потолок логов —
30 МБ на контейнер, SRS §12.2 п.5):

| Поле | Запрос | Норма | Тревога |
| --- | --- | --- | --- |
| `photoQueue` | `report_photo` в `PENDING` | < 20 | > 200 или старейшая > 10 мин |
| `deliveryQueue` | `telegram_outbox` без `sent_at` | < 10 | старейшая > 10 мин |
| `moderationQueue` | `report` в `NEW` | < 30 | > 200 |
| `photoFailed` | `report_photo` в `FAILED` | 0 | ≥ 1 |

Очередь модерации — метрика про людей, а не про машину: при 1000 заявок в час она растёт
быстрее всех остальных и раньше всех упирается в потолок (SRS §1.6, §12.3 п.2).

## Алерты

Восемь условий SRS §10.4 проверяются раз в пять минут и уходят сообщением того же бота
в `TELEGRAM_ALERT_CHAT_ID` — приватный чат координатора, **не** группу волонтёров.
Дедупликация: одно сообщение на условие в час.

| Условие | Что делать |
| --- | --- |
| `webhook_missing` | webhook сбит чужим `setWebhook` — перерегистрировать по `docs/ops/telegram-webhook.md`; модерация стоит с этой минуты |
| `webhook_foreign` | апдейты уходят на чужой адрес — то же плюс сменить токен бота |
| `webhook_pending` | Telegram копит апдейты: смотреть, отвечает ли `/api/telegram/webhook/...` снаружи |
| `webhook_errors` | Telegram получает от нас ошибки: `logs api \| jq 'select(.msg=="webhook_auth_failed")'` |
| `delivery_stale` | очередь доставки стоит: смотреть `outbox_send_failed` и `telegram_unavailable` |
| `photo_queue` | воркер фото не справляется или встал: `PHOTO_WORKERS` в `.env`, память контейнера |
| `photo_failed` | ресайз не прошёл после пяти попыток: `SELECT id, last_error FROM report_photo WHERE state='FAILED'` |
| `moderation_queue` | людей не хватает: включать пакетные действия (SRS §6.14) |
| `db_down` | БД недоступна две проверки подряд: `docker compose ps`, `logs db` |

Алерты идут **мимо** `telegram_outbox`: бюджет 20 сообщений/мин принадлежит группе,
и сообщение о вставшей очереди не должно вставать в ту очередь, о которой сообщает.

**Известное слабое место:** если недоступен сам Telegram, алерт о его недоступности
не дойдёт. Второй канал — внешний uptime-пинг на `/health`; чей именно, решает продакт
(SRS §16 п.15).

`TELEGRAM_ALERT_CHAT_ID` не задан — алерты выключены, и api пишет об этом `alerts_disabled`
на старте: «настроено» и «выключено» выглядят одинаково ровно до первой поломки.

### Правило про переменные окружения: проверять непустоту, а не наличие

`docker-compose.yml` передаёт необязательные переменные как `${VAR:-}`, поэтому «не задана»
приезжает в контейнер **пустой строкой**, а не отсутствующим ключом. Проверка на
`undefined` такую переменную считает заданной.

```ts
const value = config.get<string>('VAR')            // '' — не то же самое, что не задана
this.chatId = value === undefined || value === '' ? null : value
```

За один день это выстрелило трижды: пустой `TELEGRAM_ALERT_CHAT_ID` (алерты в чат
с пустым id), пустой `MAP_PMTILES_URL` (пустая запись в `connect-src` CSP и заблокированные
тайлы), `PHOTO_ORIGIN` без завершающего слэша. `validateEnv` в `apps/api/src/config/env.ts`
это делает правильно — но `ConfigService.get` читает `process.env` мимо него, и в коде,
читающем переменную напрямую, проверку надо повторить.

## Метрики

`docs/metrics.sql` — P-1…P-6 и North Star. Запускается вручную раз в неделю;
автоматизация появится, когда координатор начнёт делать это чаще (SRS §10.3).

```sh
cd /opt/ravonroad
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T db \
  psql -U ravonroad -d ravonroad -f - < docs/metrics.sql
```

P-4 обязан вернуть **0 строк**: это инвариант BR-006, а не отчёт. Последний запрос
показывает, что суточная задача обязана была вычистить, — ненулевые числа означают,
что она не отрабатывает.

P-2 (доля отказов геозабора) считается по логам, а не по базе: отклонённая заявка в базу
не попадает вовсе.

```sh
$C logs --no-log-prefix api | jq -c 'select(.msg=="report_rejected_geofence")' | wc -l
```

## Суточная очистка

Работает внутри api, первый проход через минуту после старта, дальше раз в сутки
(SRS §9.8, §2.11, §2.12, PRD §9.2.5):

| Что | Срок |
| --- | --- |
| `created_ip` обнуляется | 30 дней с создания |
| контакты удаляются, `contacts_deleted_at` проставляется | 90 дней после входа в терминальный статус |
| `processed_update` удаляются | 7 дней |
| `bot_prompt` удаляются | по `expires_at` |

Заявка, её фотографии и статус остаются: удаляются контакты, а не история кампании.
Проверить, что задача отрабатывает, — последним запросом `docs/metrics.sql`.

## Резервные копии

`deploy/backup.sh` — суточный `pg_dump | gzip` в S3 под префиксом `db-backups/`,
14 копий (SRS §10.5). Store of record — S3: локальные копии не переживают потерю диска,
то есть ровно тот случай, ради которого бэкап и делается. На диске остаются две последних,
чтобы откат после неудачной миграции не зависел от сети.

```
17 3 * * * /opt/ravonroad/deploy/backup.sh >>/var/log/ravonroad-backup.log 2>&1
```

**На dev cron не ставится**: восстанавливать нечего (SRS §12.2 п.4). Ручной снимок перед
рискованной миграцией:

```sh
COMPOSE_OVERLAY=docker-compose.dev.yml /opt/ravonroad/deploy/backup.sh
```

Ни `aws-cli`, ни второго контейнера: S3 подписывает сам `curl` (`--aws-sigv4`), который
на машине уже стоит.

### Проверка восстановления — раз в квартал

Разворачивается **последний дамп из S3**, а не локальная копия: проверять надо то,
чем будем восстанавливаться. Разворачивается в отдельную базу того же контейнера —
рабочую при этом не трогаем.

```sh
cd /opt/ravonroad && set -a && . ./.env && set +a
C="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
s3() { curl -sS --fail-with-body --aws-sigv4 "aws:amz:$S3_REGION:s3" \
         --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY" "$@"; }

LATEST=$(s3 "$S3_ENDPOINT/$S3_BUCKET?list-type=2&prefix=db-backups/db-" \
  | grep -o '<Key>[^<]*</Key>' | sed 's|</\?Key>||g' | sort | tail -1)
s3 "$S3_ENDPOINT/$S3_BUCKET/$LATEST" -o /tmp/restore.sql.gz

$C exec -T db psql -q -U ravonroad -d postgres -c 'CREATE DATABASE restore_check'
gunzip -c /tmp/restore.sql.gz | $C exec -T db psql -q -U ravonroad -d restore_check
$C exec -T db psql -U ravonroad -d restore_check -c \
  'SELECT (SELECT count(*) FROM district) AS districts, (SELECT count(*) FROM report) AS reports'
$C exec -T db psql -q -U ravonroad -d postgres -c 'DROP DATABASE restore_check'
rm -f /tmp/restore.sql.gz
```

Кто и когда прогоняет проверку — вопрос к продакту (`specs/006-observability/spec.md`
«Требует решения», п. 6). Без назначенного человека процедура не выполняется.

## Нагрузочные замеры

`scripts/seed-load.sql` и `docs/perf-baseline.md`. Сид запускается **только на стенде
замеров**: на проде с настоящими заявками синтетические строки становятся неотличимы
от живых, а счётчик отремонтированного — враньём.
