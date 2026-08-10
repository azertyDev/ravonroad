# Регистрация webhook

Бот работает **только** через webhook: long polling не используется (ADR-0005, SRS §6.2).
Регистрация — разовое действие на среду, делается руками, потому что она меняет настройку
боевого бота, а сбить её легко.

## Что должно быть в `.env`

| Переменная | Значение |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | токен от @BotFather |
| `TELEGRAM_GROUP_CHAT_ID` | id супергруппы волонтёров, со знаком минус |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 24` — им проверяется каждый апдейт |
| `TELEGRAM_WEBHOOK_PATH` | `openssl rand -hex 16` — случайный сегмент пути |

Первые три обязательны: без них `api` не поднимается вовсе (SRS §10.1 — узнать о неверной
настройке на старте дешевле, чем по пустой очереди через час).

## Команда

```sh
set -a; . ./.env; set +a
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<host>/api/telegram/webhook/$TELEGRAM_WEBHOOK_PATH" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  -d 'allowed_updates=["message","callback_query"]'
```

`allowed_updates` сужен намеренно: всё остальное — участники входят и выходят, сообщения
редактируются, реакции — до нас не доходит и не тратит ни разбора, ни памяти.

`url` обязан быть `https` с валидным сертификатом: Telegram не ходит на самоподписанные
адреса и на порты, кроме 443, 80, 88 и 8443.

## Проверка

```sh
curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

Смотреть на три поля (SRS §10.4): `url` — наш; `pending_update_count` — около нуля;
`last_error_date` — отсутствует или старее десяти минут. Пустой `url` означает, что
webhook кто-то сбросил — с этого момента модерация стоит, а апдейты копятся у Telegram.

## Локально

Локальная машина за NAT, и Telegram до неё не достанет. Обработчик проверяется прямым
`POST` — ровно тем же запросом, какой шлёт Telegram:

```sh
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST "http://localhost/api/telegram/webhook/$TELEGRAM_WEBHOOK_PATH" \
  -H 'content-type: application/json' \
  -H "x-telegram-bot-api-secret-token: $TELEGRAM_WEBHOOK_SECRET" \
  -d '{"update_id":1,"callback_query":{"id":"1","from":{"id":<telegram_user_id>},
       "message":{"message_id":<id карточки>,"chat":{"id":<chat_id>}},"data":"1:s:3471:AC"}}'
```

Неверный секрет обязан дать `401`, верный — `200`. Повтор с тем же `update_id` не создаёт
второго перехода.

**`setWebhook` на боевого бота с адреса разработчика не вызывать.** Один вызов уводит все
апдейты кампании на машину, которой снаружи нет, и модерация встаёт до тех пор, пока
кто-нибудь не заметит.
