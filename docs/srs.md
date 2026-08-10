# SRS — RavonRoad

Дата: 2026-08-10. Статус: черновик к реализации.
Основание: `docs/brd.md`, `docs/prd.md` (обе версии от 2026-08-10), `CLAUDE.md`,
`data/geo/README.md`. Термины — `docs/domain/glossary.md`.

Документ описывает **как** система устроена: компоненты, схема данных, контракты API,
конвейеры обработки, ограничения ресурсов. **Что** продукт делает и по каким критериям
принимается — в `docs/prd.md`; SRS его не переопределяет и не смягчает. Расхождение SRS
с PRD — ошибка SRS.

Реализация в этом документе не пишется: ни `.ts`, ни `.tsx`, ни `.prisma`. Сигнатуры,
SQL-фрагменты и схемы приведены как контракт, а не как готовый код.

> **Постоянные запреты.** Распознавание лиц, автомобильных номеров и ML-детекция ям
> не внедряются никогда — ни в MVP, ни в одной последующей версии. Основание и следствия
> для инфраструктуры — §15. Раздел обязателен к прочтению перед любой работой с фотографиями.

**Переименование сущности.** PRD и глоссарий называют единицу работы «заявка». В коде она
получает имя **`Report`**, а не `Request`: `Request` в NestJS/Express занят HTTP-запросом,
и `request.service.ts` рядом с `@Req() request` читается неоднозначно. Изменение затрагивает
уже существующий экспорт `packages/shared-types/src/index.ts` (`REQUEST_STATUSES`,
`RequestStatus` → `REPORT_STATUSES`, `ReportStatus`) и пример пути из `CLAUDE.md`
(`/requests/:id/status` → `/reports/:id/status`). Выполняется в первом же срезе, который
трогает эти файлы; глоссарий уже обновлён.

---

## 1. Архитектура

### 1.1 Компоненты

| Компонент | Что это | Где живёт |
| --- | --- | --- |
| `web` | React 19 + Vite, статический SPA. Публичный сайт: карта, список, форма, карточка, `/z/<token>` | `apps/web`, собирается в статику, отдаётся nginx |
| `edge` | nginx: TLS, статика `web`, reverse proxy на `api`, SPA-fallback, заголовки безопасности | контейнер `edge` |
| `api` | NestJS, модульный монолит, **один процесс**. Модули: `reports`, `geo`, `media`, `telegram`, `stats`, `health` | контейнер `api` |
| `db` | PostgreSQL 17 + PostGIS 3.5. Единственное состояние системы | контейнер `db` |
| `S3` | Cloupard S3 — оригиналы (≤1600 px) и превью (400 px). Внешний сервис | вне периметра |
| Telegram Bot API | доставка карточек, приём callback и фото «после» | вне периметра |
| Яндекс Карты | JS API v3 + тайлы. **Только виджет и тайлы**, геокодер не вызывается (ADR-0004) | вне периметра, грузится в браузер |

Telegram-бот — **модуль внутри `api`**, а не отдельный сервис и не отдельный процесс
(ADR-0002). Отдельного воркера, очереди сообщений и брокера в системе нет: их роль
выполняет таблица `telegram_outbox` и таймер внутри того же процесса (§6.7).

### 1.2 Схема

```
   Житель (без аккаунта)              Волонтёр / Модератор
            │                                   │
            v                                   v
 ┌──────────────────────────┐        ┌──────────────────────┐
 │  Браузер (mobile-first)  │        │  Telegram (группа)   │
 │  apps/web — статический  │        └───────┬──────────────┘
 │  SPA, React 19 + Vite    │                │
 └────┬─────────────────┬───┘                │ Bot API
      │ HTTPS /api/*    │ HTTPS              │ (webhook + вызовы)
      │                 │ JS API + тайлы     │
      v                 v                    v
 ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐
 │ edge (nginx)    │  │ Яндекс Карты │  │ Telegram Bot API │
 │ TLS, статика,   │  │ (внешний)    │  │ (внешний)        │
 │ proxy, headers  │  └──────────────┘  └────────┬─────────┘
 └────────┬────────┘                             │ POST webhook
          │ http://api:3000                      │ + secret-token
          v                                      v
 ┌─────────────────────────────────────────────────────────┐
 │ api — NestJS, ОДИН процесс (модульный монолит)          │
 │                                                         │
 │  reports ──┬── geo (point-in-polygon, дубликаты)        │
 │            ├── media (sharp: EXIF, превью, S3)          │
 │            ├── stats (счётчик)                          │
 │            └── telegram  ← МОДУЛЬ, не сервис            │
 │                 ├ webhook controller (secret-token)     │
 │                 ├ card renderer                         │
 │                 └ outbox worker (setInterval 10 с)      │
 └────┬──────────────────────────────┬─────────────────────┘
      │ SQL (Prisma + $queryRaw)     │ S3 API (PUT/HEAD)
      v                              v
 ┌──────────────────────┐     ┌─────────────────┐
 │ db: Postgres+PostGIS │     │ Cloupard S3     │
 │ единственное         │     │ фото + превью   │
 │ состояние системы    │     └─────────────────┘
 └──────────────────────┘
```

### 1.3 Поток «подача заявки»

1. Браузер: пользователь ставит пин, выбирает 1–3 файла. Каждый файл декодируется,
   уменьшается до 1600 px и конвертируется в JPEG **на устройстве** (§5.2).
2. `POST /api/reports` — один `multipart/form-data` с полями и уже сжатыми файлами
   плюс заголовок `Idempotency-Key`.
3. `api` валидирует поля, определяет район point-in-polygon (§3.3). Точка вне 12 полигонов
   → `400 OUTSIDE_TASHKENT`, ничего не создаётся и ничего не загружается в S3.
4. `api` проверяет magic bytes, перекодирует каждое фото через sharp (EXIF вырезан,
   ориентация применена к пикселям), считает sha256, кладёт оригинал и превью в S3 (§5.3).
5. Одна транзакция: `report` + `report_photo` × N + `report_status_history` (переход в `NEW`)
   + `abuse_signal` × M + строка `telegram_outbox` (kind `CARD_CREATE`).
6. Ответ `201` с номером заявки и `trackingToken`.
7. Через ≤ 10 с outbox-воркер отправляет карточку в группу и записывает `message_id`
   в `report`. Telegram недоступен — заявка уже создана и видна на карте; карточка уйдёт
   после восстановления связи (US-018).

### 1.4 Поток «смена статуса»

1. Модератор жмёт inline-кнопку → Telegram шлёт `POST /api/telegram/webhook/<random>`
   с заголовком `X-Telegram-Bot-Api-Secret-Token`.
2. `api` сверяет секрет (§9.3), затем сверяет `callback_query.from.id` с таблицей
   `moderator` — **на сервере, до любой записи** (§6.2). Не модератор → приватный alert,
   запись в лог, ноль записей в БД.
3. Транзакция: проверка допустимости перехода по таблице §5 PRD → `UPDATE report` +
   `INSERT report_status_history` + `INSERT processed_update` + `INSERT telegram_outbox`
   (kind `CARD_EDIT`) + для терминального перехода ещё одна строка outbox с
   `next_attempt_at = now() + 15 min` (kind `CARD_EDIT`, снимает кнопку отмены).
4. `answerCallbackQuery` с результатом.

### 1.5 Что осознанно отсутствует

Redis, брокер сообщений, отдельный воркер, Prometheus/Grafana, Nginx-кэш, CDN, реплика БД,
horizontal scaling, presigned upload, OpenAPI и генераторы клиента, MinIO, авторизация.
Каждый пункт стоил бы памяти, которой нет (§12), или сложности, которую нечем оправдать
на объёме 10 000 заявок за три года.

---

## 2. Модель данных

СУБД — PostgreSQL 17 + PostGIS 3.5, схема `public`. ORM — Prisma 7. Имена таблиц и колонок
`snake_case` (`CLAUDE.md`), имена моделей Prisma — `PascalCase` с `@@map`.

Расширение создаётся первой ручной миграцией:
`CREATE EXTENSION IF NOT EXISTS postgis;`. Preview-флаг `postgresqlExtensions` не включается —
`CREATE EXTENSION` в SQL-миграции решает ту же задачу без preview-функциональности.

### 2.1 Идентификаторы: почему целое число, а не UUID

Публичный идентификатор заявки — **последовательное целое** `report.id`
(`@default(autoincrement())`). Оно же:

- показывается человеку как `#1234` (экран подтверждения, карточка в Telegram);
- вводится модератором при `DUPLICATE` (US-021) — UUID руками не вводят;
- ложится в `callback_data` кнопок (лимит 64 байта, §6.4);
- образует публичный URL `/{locale}/reports/1234`.

Перебор `id` не даёт ничего: заявки публичны по замыслу (PRD §6), а общее их число публично
в счётчике. Единственная возможность, которую нельзя получить перебором, — `tracking_token`,
и он не выводится из `id` (§2.3). Второго идентификатора система не заводит: UUID здесь
означал бы две колонки, две формы записи в логах и лишние 20 байт в каждом ответе карты.

### 2.2 `report` — заявка

| Колонка | Тип | Ограничения | Комментарий |
| --- | --- | --- | --- |
| `id` | `int` | PK, identity | Публичный номер заявки |
| `status` | `report_status` (enum) | not null, default `NEW` | 7 значений из глоссария |
| `category_id` | `int` | not null, FK → `category(id)`, `ON DELETE RESTRICT` | US-010, обязательна |
| `district_code` | `varchar(32)` | not null, FK → `district(code)` | Считает сервер, житель не выбирает (US-007) |
| `latitude` | `decimal(9,6)` | not null, `CHECK (latitude BETWEEN 41.0 AND 41.6)` | 6 знаков ≈ 11 см |
| `longitude` | `decimal(9,6)` | not null, `CHECK (longitude BETWEEN 69.0 AND 69.7)` | Границы — грубый sanity-check, точный контроль в §3.3 |
| `landmark` | `varchar(200)` | null | US-009 |
| `contact_phone` | `varchar(20)` | null | Никогда не публикуется |
| `contact_telegram` | `varchar(64)` | null | Никогда не публикуется |
| `contacts_deleted_at` | `timestamptz` | null | US-014; обнуляет оба поля выше |
| `tracking_token` | `varchar(24)` | not null, **unique** | §2.3 |
| `idempotency_key` | `uuid` | null, **unique** | §4.2, защита от повторных «повторить» (US-016) |
| `duplicate_of_id` | `int` | null, FK → `report(id)`, `CHECK (duplicate_of_id <> id)` | Заполняется при `DUPLICATE` |
| `status_reason` | `varchar(48)` | null | Код причины из §5.2 PRD |
| `status_reason_text` | `varchar(500)` | null | Обязателен при `status_reason = 'other'` |
| `publication_url` | `varchar(512)` | null | US-029, заменяется целиком |
| `created_ip` | `inet` | null | Только антиабуз; удаляется через 30 дней (§9.6) |
| `telegram_album_message_id` | `int` | null | Первое сообщение альбома — якорь для ответов |
| `telegram_card_message_id` | `int` | null | Сообщение с кнопками, его редактируем |
| `created_at` | `timestamptz` | not null, default `now()` | |
| `updated_at` | `timestamptz` | not null | |
| `done_at` | `timestamptz` | null | Момент перехода в `DONE`; обнуляется при отмене (§6.10) |

Инварианты на уровне БД:

```sql
CHECK (status <> 'DUPLICATE'   OR duplicate_of_id IS NOT NULL)
CHECK (status NOT IN ('REJECTED','OUT_OF_SCOPE') OR status_reason IS NOT NULL)
CHECK (status_reason <> 'other' OR status_reason_text IS NOT NULL)
CHECK ((status = 'DONE') = (done_at IS NOT NULL))
CHECK (contacts_deleted_at IS NULL
       OR (contact_phone IS NULL AND contact_telegram IS NULL))
```

Инвариант BR-006 (`DONE` не существует без фото «после») на уровне БД одним `CHECK`
не выражается — он проверяется в той же транзакции, что и переход (§6.8), и покрывается
интеграционным тестом (§11.3). Дешёвого декларативного способа нет: он требует
подсчёта строк в другой таблице, то есть триггера, а триггер здесь дороже теста.

Индексы:

```sql
CREATE INDEX report_list_idx     ON report (created_at DESC, id DESC);
CREATE INDEX report_bbox_idx     ON report (latitude, longitude);
CREATE INDEX report_status_idx   ON report (status);
CREATE INDEX report_district_idx ON report (district_code, status);
CREATE INDEX report_done_idx     ON report (done_at DESC) WHERE done_at IS NOT NULL;
CREATE UNIQUE INDEX report_token_idx ON report (tracking_token);
CREATE UNIQUE INDEX report_idem_idx  ON report (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

`report_list_idx` обслуживает keyset-пагинацию (§4.3), `report_bbox_idx` — выборку карты
и предфильтр поиска дублей (§3.2), `report_done_idx` — счётчик и отчёт за период (US-033).

### 2.3 `tracking_token` — генерация и энтропия

```
crypto.randomBytes(16).toString('base64url')   →  22 символа, 128 бит энтропии
```

- **Источник** — `node:crypto`, CSPRNG. `Math.random()` запрещён явно: он предсказуем
  по нескольким выходам.
- **Энтропия 128 бит.** Пространство 3,4 × 10³⁸. При 10⁴ выданных токенах и лимите
  30 запросов/мин с адреса (§9.5) ожидаемое время до первого угадывания превышает возраст
  Вселенной на много порядков. Понижать до 64 бит нельзя: там уже считается.
- **Кодировка `base64url`** — 22 символа против 32 у base32. Токен копируется кнопкой,
  а не набирается руками (US-012), поэтому «неоднозначные символы» роли не играют;
  URL-безопасность важнее.
- **Не выводится из `id`.** Никакого HMAC от номера: компрометация ключа раскрыла бы все
  токены разом. Хранится как есть, `unique` — восстановить по нему заявку нужно за один
  индексный поиск.
- **Хранится в открытом виде.** Хеширование защищало бы от чтения дампа, но в том же дампе
  лежат сами контакты, ради которых токен и нужен, — защита ничего не добавляет,
  а поиск усложняет.
- **Коллизия** невозможна практически, но `unique` есть: вставка при конфликте
  повторяется один раз с новым токеном.
- Токен **никогда** не попадает в логи, в `Referer` (§9.2), в карточку Telegram
  и в ответы публичных эндпоинтов.

### 2.4 `report_photo`

| Колонка | Тип | Ограничения |
| --- | --- | --- |
| `id` | `int` | PK, identity |
| `report_id` | `int` | not null, FK → `report(id)` `ON DELETE CASCADE` |
| `kind` | `photo_kind` (enum `BEFORE`\|`AFTER`) | not null |
| `sort_order` | `smallint` | not null, `CHECK (sort_order BETWEEN 0 AND 2)` |
| `object_key` | `varchar(160)` | not null — ключ полного изображения в S3 |
| `preview_key` | `varchar(160)` | not null — ключ превью 400 px |
| `sha256` | `char(64)` | not null — хеш **итоговых** байт после перекодирования |
| `width`, `height` | `smallint` | not null |
| `bytes` | `int` | not null |
| `uploaded_by_telegram_user_id` | `bigint` | null — только для `AFTER` |
| `created_at` | `timestamptz` | not null, default `now()` |

```sql
CREATE UNIQUE INDEX photo_slot_idx ON report_photo (report_id, kind, sort_order);
CREATE UNIQUE INDEX photo_dedup_idx ON report_photo (report_id, kind, sha256);
```

`photo_slot_idx` + `CHECK` на `sort_order` дают жёсткий предел **3 фото каждого типа
на заявку** средствами БД — приложению остаётся вернуть внятную ошибку (US-008, US-028).
`photo_dedup_idx` делает повторную доставку одного и того же файла из Telegram
неотличимой от первой (§6.11).

### 2.5 `category`

| Колонка | Тип | Комментарий |
| --- | --- | --- |
| `id` | `int` PK | |
| `code` | `varchar(32)` unique | `roadway_pothole`, `sidewalk_pothole`, `yard_damage`, `sinkhole`, `utility_cover`, `other` |
| `name_uz`, `name_ru` | `varchar(120)` | Показываются жителю и в карточке бота |
| `sort_order` | `smallint` | Порядок в списке формы |
| `is_active` | `boolean` | Скрывает из формы, не ломая старые заявки |

Таблица, а не enum: PRD §12.2 прямо говорит, что список категорий надо сверить с бригадой
до релиза формы, а после релиза он поменяется. Правка строки в таблице дешевле миграции
enum и передеплоя.

### 2.6 `district`

| Колонка | Тип | Комментарий |
| --- | --- | --- |
| `code` | `varchar(32)` PK | `bektemir`, `chilonzor`, `mirobod`, `mirzo-ulugbek`, `olmazor`, `sergeli`, `shayxontohur`, `uchtepa`, `yakkasaroy`, `yangihayot`, `yashnobod`, `yunusobod` |
| `name_uz`, `name_ru`, `name_en` | `varchar(120)` | Из свойств GeoJSON |
| `area_ha` | `int` | Из датасета, для сверки при сиде |
| `bbox_min_lon/min_lat/max_lon/max_lat` | `decimal(9,6)` | Считается при сиде; нужен для «подогнать карту под район» (US-031) без обращения к PostGIS в рантайме |
| `geom` | `Unsupported("geography(MultiPolygon, 4326)")` | Единственное поле-`Unsupported` во всей схеме |

```sql
CREATE INDEX district_geom_idx ON district USING GIST (geom);
```

12 строк, наполняются сид-скриптом из `data/geo/tashkent-districts.geojson` через
`ST_GeomFromGeoJSON(...)::geography` в `$executeRaw`. `Polygon` приводится
к `MultiPolygon` (`ST_Multi`), чтобы тип колонки был один для всех 12 строк, — иначе
Мирзо-Улугбекский с его эксклавом требовал бы отдельной обработки в каждом запросе.

### 2.7 `report_status_history`

| Колонка | Тип | Комментарий |
| --- | --- | --- |
| `id` | `int` PK | |
| `report_id` | `int` not null, FK | |
| `from_status` | `report_status` null | `null` только у первой записи (создание) |
| `to_status` | `report_status` not null | |
| `actor_type` | enum `SYSTEM`\|`MODERATOR`\|`VOLUNTEER` | |
| `actor_telegram_user_id` | `bigint` null | Кто нажал/прислал. **Никогда не публикуется** |
| `moderator_id` | `int` null, FK → `moderator(id)` | Заполнен, если действовал модератор |
| `reason` | `varchar(48)` null | Код причины |
| `reason_text` | `varchar(500)` null | Текст при `other` |
| `duplicate_of_id` | `int` null | Оригинал при `DUPLICATE` |
| `undone_at` | `timestamptz` null | Проставляется, когда переход отменён |
| `undoes_history_id` | `int` null, FK → `report_status_history(id)` unique | Заполнено у записи-отмены |
| `created_at` | `timestamptz` not null | |

```sql
CREATE INDEX history_report_idx ON report_status_history (report_id, created_at);
CREATE UNIQUE INDEX history_undo_once_idx
  ON report_status_history (undoes_history_id) WHERE undoes_history_id IS NOT NULL;
```

Отмена (PRD 5.4) — **новая строка**, а не правка старой: инвариант 5.3.4 требует, чтобы
история не переписывалась задним числом. `history_undo_once_idx` делает двойную отмену
одного перехода невозможной на уровне БД, а не «маловероятной» из-за проверки в коде.

Публичная история (US-004) отдаёт только `to_status`, `created_at` и признак отмены.
`actor_*` и `moderator_id` не покидают сервер (PRD §6.2).

### 2.8 `moderator`

| Колонка | Тип | Комментарий |
| --- | --- | --- |
| `id` | `int` PK | |
| `telegram_user_id` | `bigint` unique not null | Единственный идентификатор личности в системе |
| `display_name` | `varchar(120)` | Для журнала и `/mod_list`; публично не показывается |
| `is_active` | `boolean` not null default true | Снятие полномочий — `false`, не `DELETE`: FK из истории должен пережить |
| `added_at` | `timestamptz` not null | |
| `added_by_moderator_id` | `int` null FK self | `null` только у первого, засеянного при развёртывании |
| `deactivated_at` | `timestamptz` null | |

```sql
CREATE INDEX moderator_active_idx ON moderator (telegram_user_id) WHERE is_active;
```

Allowlist — **таблица, а не переменная окружения** (ADR-0005). Следствия: состав меняется
без передеплоя (US-024), каждое действие в истории ссылается на `moderator.id`, снятие
полномочий не стирает след прошлых решений.

Правка состава в MVP выполняется одним `UPDATE`/`INSERT` в psql по документированному
сниппету — этого достаточно для «без передеплоя и без изменения кода» (US-024).
Команд бота `/mod_add`, `/mod_del`, `/mod_list` в MVP нет; они добавляются, когда состав
бригады начнёт меняться чаще раза в месяц. Потолок решения: правка требует доступа
к серверу, поэтому владелец доступа должен быть тем же человеком, что и координатор.

### 2.9 `abuse_signal`

| Колонка | Тип | Комментарий |
| --- | --- | --- |
| `id` | `int` PK | |
| `report_id` | `int` not null FK `ON DELETE CASCADE` | |
| `rule` | enum `HONEYPOT`\|`FAST_FILL`\|`IP_RATE` | PRD §10.2–10.4 |
| `detail` | `jsonb` null | `{"fillMs":1200}`, `{"perHour":14}`. Без IP-адреса — он в `report.created_ip` |
| `created_at` | `timestamptz` not null | |

Отдельная таблица, а не булев флаг в `report`: карточка модератора перечисляет **какие
именно** правила сработали (US-025), а пороги пересматриваются на 30-й день — по этой
таблице видно, какое правило шумит.

Денормализованного флага «есть сигнал» нет: строка нужна ровно в двух местах —
при рендере карточки (данные уже в памяти) и в отчёте P-3 (агрегат раз в неделю).

### 2.10 `telegram_outbox`

| Колонка | Тип | Комментарий |
| --- | --- | --- |
| `id` | `bigint` PK | |
| `report_id` | `int` null FK `ON DELETE CASCADE` | |
| `kind` | enum `CARD_CREATE`\|`CARD_EDIT`\|`REPLY`\|`ALERT` | |
| `payload` | `jsonb` not null | Готовый набор аргументов вызова Bot API |
| `next_attempt_at` | `timestamptz` not null default `now()` | Отложенная отправка задаётся здесь |
| `attempts` | `smallint` not null default 0 | |
| `last_error` | `varchar(500)` null | |
| `sent_at` | `timestamptz` null | |

```sql
CREATE INDEX outbox_due_idx ON telegram_outbox (next_attempt_at)
  WHERE sent_at IS NULL;
```

Та же таблица закрывает три задачи: повтор при недоступности Telegram, схлопывание
нескольких правок одной карточки и **отложенное на 15 минут** снятие кнопки отмены (§6.10).
Отдельный планировщик не заводится: у outbox уже есть колонка «когда».

### 2.11 `processed_update`

| Колонка | Тип |
| --- | --- |
| `update_id` | `bigint` PK |
| `created_at` | `timestamptz` not null default `now()` |

Идемпотентность webhook (§6.11). Записи старше 7 дней удаляются суточной задачей.

### 2.12 `bot_prompt`

| Колонка | Тип | Комментарий |
| --- | --- | --- |
| `chat_id` | `bigint` | PK вместе с `message_id` |
| `message_id` | `int` | Сообщение бота с `ForceReply` |
| `report_id` | `int` not null FK | |
| `kind` | enum `REASON_TEXT`\|`DUPLICATE_NUMBER` | |
| `moderator_id` | `int` not null FK | Ответить может только он |
| `expires_at` | `timestamptz` not null | `now() + 1 hour` |

Минимальное состояние для двухшаговых переходов, требующих текстового ввода (§6.5).
Просроченные строки чистит та же суточная задача.

### 2.13 `form_open_counter`

| Колонка | Тип |
| --- | --- |
| `day` | `date` PK |
| `count` | `int` not null |

Один счётчик в сутки, инкремент `INSERT ... ON CONFLICT DO UPDATE`. Нужен ровно для
метрики P-1 (конверсия формы) и не содержит ни идентификаторов, ни cookie, ни IP —
поэтому не конфликтует с PRD §9.4. Внешняя аналитика не подключается.
[требует проверки: PRD §12.7 — согласен ли владелец кампании считать конверсию так,
без внешнего сервиса; проверить, достаточно ли посуточной гранулярности]

### 2.14 Геометрия в Prisma: выбранный обходной путь

**Проблема.** У Prisma нет нативного типа `geography`. Поле, объявленное как
`Unsupported("geography(...)")`, существует в схеме и в миграциях, но **недоступно
в Prisma Client**: его нельзя ни прочитать в `findMany`, ни записать в `create`.
Обращение возможно только через `$queryRaw`/`$executeRaw`, и типизация результата
такого запроса — ручная.

**Решение: геометрия есть только у районов, у заявок — только широта и долгота.**

| Таблица | Как хранится точка/полигон | Кто пишет | Кто читает |
| --- | --- | --- | --- |
| `district` | `geom geography(MultiPolygon,4326)` + GiST | сид-скрипт, `$executeRaw` | `$queryRaw` (point-in-polygon) |
| `report` | `latitude`/`longitude` — обычные `Decimal(9,6)` | Prisma Client, обычный `create` | Prisma Client, обычный `findMany` |

Следствия:

- **Миграции.** Ровно две ручные правки сгенерированного SQL: `CREATE EXTENSION postgis`
  и `CREATE INDEX ... USING GIST`. Обе делаются один раз, в первой миграции, через
  `prisma migrate dev --create-only`. `report` мигрирует полностью автоматически — там
  нет ни одного типа, которого Prisma не знает.
- **Типизация.** `Unsupported` встречается в схеме один раз, в таблице из 12 строк,
  которая после сида не меняется. Весь остальной код работает с обычными типами Prisma
  Client. Ручная типизация нужна для двух `$queryRaw` (§3.3, §3.2) — каждый возвращает
  скалярную строку из двух-трёх колонок, и её тип объявляется в `packages/shared-types`.
- **Дрейф схемы.** `prisma migrate diff` не пытается «починить» `Unsupported`-колонку —
  она объявлена в схеме и известна Prisma. Generated-колонок и триггеров в схеме нет:
  их Prisma действительно не умеет описывать, и каждая такая конструкция ломала бы
  `migrate dev` при каждом запуске.
- **Потолок.** Поиск дублей и выборка карты идут по btree-индексу `(latitude, longitude)`
  с добором `ST_DWithin` на отфильтрованных строках (§3.2). На горизонте кампании —
  10 000 заявок, целевая цифра BRD — это десятки миллисекунд. Порог, после которого
  нужен настоящий `geography`-столбец с GiST на `report`, — примерно **10⁵ строк**:
  дальше bbox-предфильтр перестаёт быть селективным на плотных районах. Апгрейд —
  одна миграция и правка одного запроса, обратной несовместимости он не создаёт.

**Как тестируется** (детали — §11.3):

- контейнер `postgis/postgis:17-3.5` в интеграционных тестах, миграции + сид накатываются
  как в проде;
- контрольные точки: центр Чиланзара и Юнусабада → соответствующий район;
- **эксклав Мирзо-Улугбекского** → `mirzo-ulugbek`. Опорная точка эксклава, вычисленная
  по репозиторному GeoJSON: `69.454308, 41.413567` (меньшая часть `MultiPolygon`,
  ≈ 387 га); опорная точка основной части — `69.362305, 41.337918` (≈ 5562 га);
  сумма ≈ 5949 га против 5945 га в свойстве `area_ha` — расхождение 0,07%;
- Самарканд и Чирчик → `null`, форма отклоняет (геозабор);
- ни одна контрольная точка не попадает в два района одновременно;
- дубли: две точки в 30 м → находят друг друга, в 300 м → нет.

---

## 3. Гео

### 3.1 Где что считается

| Задача | Где | Чем | Когда |
| --- | --- | --- | --- |
| Определение района | сервер | PostGIS `ST_Contains` по `district.geom` | один раз, при создании заявки |
| Геозабор | сервер | тот же запрос: пусто → отказ | один раз, при создании заявки |
| Выборка для карты | сервер | btree `(latitude, longitude)`, `BETWEEN` | на каждый сдвиг/зум карты |
| Поиск дублей | сервер | bbox-предфильтр + `ST_DWithin` | при создании заявки, справочно для модератора |
| Кластеризация | **клиент** | `YMapClusterer` Яндекс JS API | на каждый рендер карты |

Клиент не вычисляет ни район, ни попадание в город: и то, и другое — решения, влияющие
на данные, а всё, что приходит из браузера, недостоверно (§9.6).

### 3.2 Bbox-выборка и поиск дублей

**Карта.** Прямоугольник видимой области в WGS84 — это обычное неравенство по двум
колонкам, поэтому PostGIS здесь не нужен:

```sql
SELECT id, latitude, longitude, status
  FROM report
 WHERE status IN ('NEW','ACCEPTED','IN_PROGRESS','DONE','OUT_OF_SCOPE')
   AND latitude  BETWEEN :minLat AND :maxLat
   AND longitude BETWEEN :minLon AND :maxLon
 ORDER BY id DESC
 LIMIT 5000;
```

Антимеридиан и полюса, из-за которых bbox-запросы обычно и ломаются, для города
шириной 0,35° географической долготы нерелевантны: репозиторный GeoJSON целиком лежит
в `69.122342 … 69.469873` по долготе и `41.163456 … 41.422465` по широте.

**Дубликаты.** Радиус 50 м вокруг новой точки, среди заявок в нетерминальных статусах
и `DONE` за последние 90 дней:

```sql
SELECT id, status, created_at
  FROM report
 WHERE latitude  BETWEEN :lat - 0.00050 AND :lat + 0.00050   -- ≈ ±55 м
   AND longitude BETWEEN :lon - 0.00067 AND :lon + 0.00067   -- ≈ ±55 м на широте 41°
   AND status <> 'REJECTED'
   AND ST_DWithin(
         ST_MakePoint(longitude, latitude)::geography,
         ST_MakePoint(:lon, :lat)::geography,
         50)
 ORDER BY created_at DESC
 LIMIT 5;
```

Первые два условия отсекают всё по индексу, `ST_DWithin` считается на единицах строк.
Радиус 50 м — проектный ориентир: соседние ямы на одной улице обычно дальше, а три соседа,
снимающих одну яму, промахиваются пином на 10–30 м.
[требует проверки: реальный разброс пинов по первым 200 заявкам; порог пересматривается
на 30-й день вместе с порогами PRD §1.3]

Результат — **подсказка модератору** в карточке («рядом заявки #12, #48»), а не
автоматическая простановка `DUPLICATE`. Решение о дубле принимает человек (US-021).

### 3.3 Point-in-polygon и геозабор — один запрос

Это одна операция с двумя исходами, а не две проверки:

```sql
SELECT code
  FROM district
 WHERE ST_Contains(geom::geometry,
                   ST_SetSRID(ST_MakePoint(:lon, :lat), 4326))
 LIMIT 1;
```

- строка есть → `report.district_code` = `code`;
- строк нет → `400 OUTSIDE_TASHKENT`, заявка не создаётся, фото в S3 не попадают
  (проверка идёт **до** загрузки, §5.3).

Эксклав Мирзо-Улугбекского обрабатывается сам собой: он — часть `MultiPolygon` этого
района, и `ST_Contains` по мультиполигону возвращает ту же строку, что и для основной
части. Никакого специального кода эксклав не требует — требуется только не разбивать
`MultiPolygon` на отдельные строки при сиде (§2.6).

`LIMIT 1` стоит не «на всякий случай»: по данным `data/geo/README.md` пересечений между
районами нет (проверено сеткой из 2940 точек при сборке датасета), и `LIMIT 1` фиксирует
это ожидание, а интеграционный тест его перепроверяет.

`geom` хранится как `geography` (правильные метры в `ST_DWithin`), а для `ST_Contains`
приводится к `geometry`: в PostGIS `ST_Contains` определён для `geometry`, и на масштабе
города разница между сферой и плоскостью на границе полигона меньше точности самих
границ.

### 3.4 Кластеризация на клиенте: порог и что за ним

Кластеризация выполняется в браузере (`YMapClusterer` из Яндекс JS API v3): сервер отдаёт
плоский список точек, кластеры строит карта. Причина — сервер на 2 ГБ не должен считать
кластеры на каждый жест зума, а карта делает это в воркере рендера бесплатно.

Три ограничения, каждое со своим числом:

| Ограничение | Порог | Что происходит дальше |
| --- | --- | --- |
| Бюджет трафика (PRD §8.1: 700 КБ на первую загрузку) | **~15 000 точек** = ~450 КБ JSON в компактном формате `[lon,lat,s,id]` | Payload вытесняет собственный код страницы |
| Время построения кластеров на среднем Android | **~20 000 точек** — заметный джанк при зуме, INP > 200 мс (PRD §8.1) | Карта перестаёт быть интерактивной |
| Ответ API | жёсткий `LIMIT 5000` + флаг `truncated: true` | UI показывает «приблизьте карту, показаны не все» |

Практический порог — **10 000 публичных заявок**, то есть ровно цель кампании. До него
клиентская кластеризация с bbox-фильтром работает без оговорок. После — переходим на
серверную агрегацию по сетке (`GROUP BY round(lat, k), round(lon, k)` с `k`, зависящим
от зума), отдавая кластеры как готовые точки с числом внутри. Это одна ручка и один
дополнительный запрос; переделывать клиент не придётся, формат точки тот же.

Пока порог не достигнут, `LIMIT 5000` + bbox гарантируют, что даже при ошибке в фильтрах
клиент не получит больше 5000 точек.

---

## 4. API

Базовый префикс `/api`. Формат — JSON, `UTF-8`. Пути `kebab-case`, множественное число
(`CLAUDE.md`). Контракт запросов и ответов объявляется один раз в
`packages/shared-types` и импортируется обеими сторонами (ADR-0006). OpenAPI не создаётся.

Общие правила:

- Ни один публичный ответ не содержит `contact_phone`, `contact_telegram`,
  `tracking_token`, `created_ip`, сигналов антиабуза и `telegram_user_id` (PRD §6.2).
  Это проверяется тестом на форму ответа, а не глазами на ревью.
- Каждый ответ несёт заголовок `X-Request-Id` (§8.3).
- Локаль ответа роли не играет: сервер отдаёт **коды**, локализует их клиент (§8.2).

### 4.1 Сводка

| Метод | Путь | Назначение | US |
| --- | --- | --- | --- |
| `POST` | `/api/reports` | Создать заявку (multipart) | US-006…US-011, US-016, US-017 |
| `GET` | `/api/reports` | Список с фильтрами, cursor-пагинация | US-003, US-031, US-032, US-033 |
| `GET` | `/api/reports/map` | Компактные точки для карты | US-001 |
| `GET` | `/api/reports/:id` | Публичная карточка | US-004 |
| `GET` | `/api/track/:token` | Страница отслеживания | US-013 |
| `DELETE` | `/api/track/:token/contacts` | Удалить контакты | US-014 |
| `GET` | `/api/stats` | Счётчик отремонтированного | US-005 |
| `GET` | `/api/districts` | 12 районов с bbox и названиями | US-003, US-031 |
| `GET` | `/api/categories` | Активные категории | US-010 |
| `POST` | `/api/form-opens` | Инкремент счётчика открытий формы (P-1) | — |
| `POST` | `/api/telegram/webhook/:path` | Приём апдейтов Telegram | §6 |
| `GET` | `/health`, `/ready` | Liveness / readiness | §10 |

### 4.2 `POST /api/reports`

`Content-Type: multipart/form-data`. Заголовок `Idempotency-Key: <uuid>` — **обязателен**.

| Часть | Тип | Обязательность | Валидация |
| --- | --- | --- | --- |
| `photos` | до 3 файлов | ≥ 1 | ≤ 4 МБ на файл, ≤ 8 МБ суммарно, magic bytes JPEG/PNG/WebP |
| `latitude`, `longitude` | число | да | 6 знаков, внутри грубых границ, затем геозабор (§3.3) |
| `categoryCode` | строка | да | существует и `is_active` |
| `landmark` | строка | нет | ≤ 200 символов, обрезка пробелов |
| `contactPhone` | строка | нет | `+998XXXXXXXXX` или 9 цифр |
| `contactTelegram` | строка | нет | `^@?[A-Za-z0-9_]{5,32}$`, `@` нормализуется |
| `website` | строка | нет | **honeypot**, §10.2 PRD: заполнено → сигнал, не отказ |
| `formOpenedAt` | ISO-время | нет | база для правила «скорость» |

`201 Created`:

```json
{ "id": 1234,
  "trackingToken": "8Qm2xZr7Kd0pV1sYtN4bLg",
  "trackingPath": "/uz/z/8Qm2xZr7Kd0pV1sYtN4bLg",
  "districtCode": "chilonzor",
  "status": "NEW",
  "createdAt": "2026-08-10T09:12:44.101Z" }
```

**Идемпотентность.** `idempotency_key` — уникальный индекс. Повторный запрос с тем же
ключом отдаёт `200` и то же тело (US-016: несколько нажатий «повторить» = одна заявка).
Ключ генерирует клиент один раз на заполнение формы и хранит вместе с черновиком; после
успеха черновик и ключ удаляются. Тот же ключ с **другим** телом → `409 IDEMPOTENCY_CONFLICT`.

Коды ошибок: `400 VALIDATION_FAILED`, `400 OUTSIDE_TASHKENT`, `400 PHOTOS_REQUIRED`,
`409 IDEMPOTENCY_CONFLICT`, `413 PAYLOAD_TOO_LARGE`, `415 UNSUPPORTED_MEDIA_TYPE`,
`429 RATE_LIMITED`, `503 STORAGE_UNAVAILABLE` (S3 недоступен — заявка не создаётся,
клиент сохраняет черновик и повторяет с тем же ключом).

Лимиты: мягкий флаг с 10 отправок/час с адреса (PRD §10.4), жёсткий отказ — только
с 60/час (§9.5). Тело — 8 МБ, таймаут запроса 30 с, одновременных загрузок в обработке
не более 2 (§5.4).

### 4.3 `GET /api/reports`

Параметры: `status` (список через запятую), `category`, `district`, `from`, `to`,
`dateField` (`created` \| `done`, по умолчанию `created`), `bbox`, `limit` (≤ 50,
по умолчанию 20), `cursor`.

`status=REJECTED` и `status=DUPLICATE` игнорируются: этих заявок нет ни в списке,
ни на карте (PRD §6.1). Явный запрос — не ошибка, просто пустой результат по этому
значению; иначе координатор получал бы 400 на безобидную опечатку.

```json
{ "items": [ { "id": 1234, "status": "ACCEPTED", "districtCode": "chilonzor",
               "categoryCode": "roadway_pothole", "landmark": "напротив дома 12",
               "latitude": 41.285512, "longitude": 69.204411,
               "previewUrl": "https://…/photos/a1/a1b2….jpg",
               "photoCount": 2, "createdAt": "…", "doneAt": null } ],
  "nextCursor": "MTc2NTM3NjM2NDEwMS4xMjM0",
  "total": null }
```

`total` — всегда `null` в MVP: `COUNT(*)` по фильтру стоит полного скана, а показывать
его негде, кроме счётчика по району (US-031), который берётся отдельным дешёвым запросом
с `GROUP BY district_code`.

**Курсор — keyset, не offset.** Формат: `base64url("<sortValueMs>.<id>")`, например
`1765376364101.1234`.

- **Почему не offset.** Заявки приходят непрерывно; при `OFFSET 20` вставка новой строки
  сдвигает окно, и пользователь видит один и тот же элемент дважды или теряет его.
  Keyset по `(created_at DESC, id DESC)` устойчив к вставкам и точно ложится
  на `report_list_idx`.
- **Почему пара значений.** `created_at` не уникален (две заявки в одну миллисекунду
  реальны при всплеске); `id` добавлен как разрыв ничьей.
- **Почему base64url, а не пара голых чисел.** Курсор непрозрачен: формат меняется
  вместе с сортировкой, и клиент на него не завязывается. Никакой подписи нет — внутри
  только публичные поля публичной заявки, подписывать нечего.
- Битый курсор → `400 INVALID_CURSOR`, а не молчаливый сброс на первую страницу:
  молчаливый сброс маскирует баг пагинации.

### 4.4 `GET /api/reports/map` и `GET /api/reports/:id`

`/map` — те же фильтры, но компактный формат ради бюджета трафика:

```json
{ "points": [[69.204411, 41.285512, 1, 1234], [69.21, 41.29, 3, 1235]],
  "statuses": ["NEW","ACCEPTED","IN_PROGRESS","DONE","OUT_OF_SCOPE"],
  "truncated": false }
```

Точка — `[lon, lat, statusIndex, id]`. Индекс вместо строки статуса экономит ~12 байт
на точку: на 5000 точках это 60 КБ из бюджета в 700 КБ.

`/reports/:id` — карточка: фото «до» и (для `DONE`) «после» с превью, район, категория,
ориентир, координаты, статус, публичная история переходов, `publicationUrl`.
Статусы `REJECTED` и `DUPLICATE` → `404 NOT_FOUND` без различия с несуществующей заявкой
(US-004).

### 4.5 `GET /api/track/:token` и `DELETE /api/track/:token/contacts`

`GET` отдаёт всё из карточки плюс то, что видит только владелец ссылки: `statusReason`,
`statusReasonText`, `duplicateOfId` (US-013) и `hasContacts` — булев признак, а не сами
контакты: страница показывает кнопку удаления, а не значения (US-014).

`DELETE …/contacts` → `204`, идемпотентен: повторный вызов на уже очищенной заявке тоже
`204`. Обнуляет оба поля и ставит `contacts_deleted_at`. Обоснование права на удаление —
владение ссылкой; другого способа подтвердить личность без авторизации не существует
(PRD §9.2.3).

Оба маршрута: `404 NOT_FOUND` при неизвестном токене, без различия «не существовал» /
«удалён» (US-013), лимит 30 запросов/мин с адреса (§9.5), `Referrer-Policy: no-referrer`
на всём сайте (§9.2), `Cache-Control: no-store`.

### 4.6 Остальные

- `GET /api/stats` → `{ "done": 137, "goal": 10000 }`. `done` — это `COUNT(*) WHERE
  status = 'DONE'`, не хранимое число (инвариант PRD 5.3.2). Кэш в памяти процесса 30 с:
  укладывается в требование «счётчик обновился за ≤ 60 с».
- `GET /api/districts` → 12 объектов `{code, nameUz, nameRu, bbox}`.
  `Cache-Control: public, max-age=86400`.
- `GET /api/categories` → активные категории. Тот же кэш.
- `POST /api/form-opens` → `204`, тело пустое. Инкремент суточного счётчика,
  лимит 60/час с адреса, без cookie и идентификаторов.

---

## 5. Загрузка фотографий

### 5.1 Конвейер целиком

```
 [браузер]                                   [api]                      [S3]
 выбор файла
   │ 1 magic-byte/размер (быстрый отказ)
   │ 2 createImageBitmap(imageOrientation:'from-image')
   │ 3 OffscreenCanvas → 1600 px по длинной стороне
   │ 4 convertToBlob({type:'image/jpeg', quality:0.82})
   │ 5 превью в UI из того же bitmap
   └── multipart POST ──────────────────────> 6 лимиты размера
                                              7 magic bytes (снова, серверу клиент не верит)
                                              8 ГЕОЗАБОР — до любой работы с файлами
                                              9 sharp: .rotate() → resize(1600) → jpeg
                                                (метаданные не переносятся = EXIF вырезан)
                                             10 sharp: превью 400 px
                                             11 sha256 по ИТОГОВЫМ байтам
                                             12 ключ = photos/<sha[0:2]>/<sha>.jpg ────> PUT
                                             13 транзакция: report + photo + history + outbox
```

### 5.2 Клиент, включая Safari iOS и HEIC

Уменьшение и конвертация выполняются **до** отправки (PRD §7.1): мобильный трафик платный,
а исходное фото с телефона — 3–6 МБ против 150–350 КБ после обработки.

- Декодирование — `createImageBitmap(file, { imageOrientation: 'from-image' })`. Он же
  решает задачу ориентации: поворот применяется к пикселям, поэтому после вырезания EXIF
  фото не переворачивается (PRD §7.1).
- Масштабирование — `OffscreenCanvas` + `convertToBlob`, обе доступны в целевых браузерах
  (PRD §8.5).
- **HEIC на Safari iOS.** `createImageBitmap` опирается на системный декодер, поэтому
  на iOS HEIC декодируется. [требует проверки: отдаёт ли iOS Safari в `input[type=file]`
  исходный HEIC или уже конвертированный JPEG — PRD §8.5 держит этот вопрос открытым;
  проверяется на реальном устройстве, не в симуляторе]
- **HEIC вне iOS** (файл с айфона, открытый на Android/десктопе): `createImageBitmap`
  отклоняется промисом. Показываем ошибку «формат не поддерживается, снимите фото
  или сохраните как JPEG». Библиотеку-конвертер (`heic2any` и аналоги) **не подключаем**:
  это ~1,5 МБ wasm при бюджете страницы 700 КБ (PRD §8.1) — цена всего бюджета ради
  редкого сценария.
- Ошибка декодирования любого файла не роняет форму: этот файл отклоняется, остальные
  остаются.

### 5.3 Сервер

1. **Лимиты.** ≤ 4 МБ на файл, ≤ 8 МБ на запрос, ≤ 3 файла. Проверяются на потоке,
   до буферизации.
2. **Magic bytes.** Первые 12 байт: `FF D8 FF` → JPEG, `89 50 4E 47` → PNG,
   `52 49 46 46 … 57 45 42 50` → WebP. Всё прочее — `415 UNSUPPORTED_MEDIA_TYPE`.
   Заголовок `Content-Type` и расширение файла не учитываются вообще: их пишет клиент.
   SVG отклоняется явно, даже если когда-нибудь попадёт в список форматов, — рендер SVG
   это исполнение чужой разметки.
   HEIC **сервером не принимается**: сборка sharp без `libheif` его не декодирует,
   а собирать свою ради формата, который клиент уже конвертировал, незачем. Если клиент
   не справился (§5.2), пользователь видит понятную ошибку ещё в браузере.
3. **Геозабор — раньше файлов.** Точка вне города → отказ до единого байта в S3.
4. **Перекодирование.** `sharp(buf).rotate().resize({width:1600,height:1600,fit:'inside',
   withoutEnlargement:true}).jpeg({quality:82,mozjpeg:true})`. sharp по умолчанию **не
   переносит метаданные** в результат — этим и вырезается EXIF целиком: GPS, модель камеры,
   дата съёмки, серийный номер. `.withMetadata()` в проекте запрещён.
   `limitInputPixels: 50_000_000` — защита от «бомб» (файл 10 000 × 10 000 в 200 КБ).
5. **Превью** 400 px по длинной стороне, `quality:75` — из того же `sharp`-пайплайна.
6. **sha256** считается по итоговым байтам, после перекодирования. Хеш исходника
   бесполезен: у двух пользователей, снявших одно и то же, байты разные, а у одного файла,
   доставленного Telegram дважды, — одинаковые именно после нормализации.

### 5.4 Ключи в бакете и дедупликация

```
photos/<sha256[0:2]>/<sha256>.jpg          полное, ≤1600 px
photos/<sha256[0:2]>/<sha256>_400.jpg      превью
```

- **Контент-адресация.** Ключ определяется содержимым, поэтому повторная загрузка того же
  файла — идемпотентный `PUT` по тому же ключу. Это и есть дедупликация: отдельной
  таблицы хешей не нужно.
- **Двухсимвольный префикс** разбрасывает объекты по 256 «папкам»: листинг бакета
  и консоль остаются пригодными к использованию при десятках тысяч объектов.
- **Ключ не содержит `report_id`.** Иначе одно и то же фото, прилетевшее из Telegram
  дважды на разные заявки, хранилось бы дважды. Связь «фото ↔ заявка» живёт в БД,
  и это единственное место, где она нужна.
- **Следствие для удаления** (PRD §12.5): прежде чем удалить объект по просьбе жителя,
  надо убедиться, что на этот `sha256` нет других строк `report_photo`. Один `COUNT`.
- **Осиротевшие объекты.** Если транзакция §5.1.13 упала после `PUT`, объект остаётся
  в бакете без строки в БД. Это ≈ 200 КБ и редкий случай; сборщик мусора в MVP
  не пишется. Порог, после которого он понадобится: > 1% объектов без строк —
  проверяется одним разовым скриптом сверки раз в квартал.
- Объекты кладутся с `Content-Type: image/jpeg`, `Cache-Control: public, max-age=31536000,
  immutable` (ключ неизменен по построению) и `Content-Disposition: inline`.
- Публичное чтение — по `S3_PUBLIC_BASE_URL`; запись — только серверными ключами.
  Presigned upload не используется: клиент никогда не пишет в бакет напрямую (ADR-0003
  не о том, но принцип общий — валидация и вырезание EXIF обязаны стоять между
  пользователем и хранилищем).

### 5.5 Фото «после»

Приходят из Telegram (§6.8). Отличия от «до»: клиентского уменьшения нет — сжатие сделал
Telegram; скачиваем самый большой вариант из `message.photo[]` через `getFile` + `file_path`.
Дальше — тот же конвейер, начиная с шага 4 (§5.3): перекодирование, вырезание EXIF,
превью, sha256, тот же формат ключа.
[требует проверки: разрешение и качество файлов после сжатия Telegram — достаточно ли
их для публикации связки «до/после» в Instagram; PRD §7.3]

### 5.6 Память при обработке

Декодированный кадр 1600 × 1200 — это ~7,7 МБ RSS. Ограничения (§12):

- `sharp.concurrency(1)` и `VIPS_CONCURRENCY=1` — libvips не поднимает пул потоков;
- `sharp.cache({ memory: 32 })` — 32 МБ вместо 50 МБ по умолчанию;
- семафор на **2 одновременных конвейера** во всём процессе; третья загрузка ждёт
  в очереди, при ожидании > 20 с → `429 RATE_LIMITED` с `Retry-After`;
- фото внутри одной заявки обрабатываются последовательно, не `Promise.all`.

Итог: пик обработки ограничен ~40 МБ поверх базовой памяти процесса. Без этих ограничений
три параллельные заявки по три фото укладывают контейнер на 512 МБ.

---

## 6. Telegram-бот как модуль NestJS

### 6.1 Границы модуля и способ вызова Bot API

`apps/api/src/telegram/` — обычный модуль Nest: контроллер webhook, сервисы рендера
карточки, обработки callback, приёма фото, outbox-воркер. Отдельного процесса нет
(ADR-0002).

Вызовы Bot API — прямые `fetch` к `https://api.telegram.org/bot<token>/<method>`.
Используются **шесть** методов: `sendMediaGroup`, `sendMessage`, `editMessageText`,
`answerCallbackQuery`, `getFile`, `getWebhookInfo`. Фреймворк бота (telegraf, grammY)
не подключается: он приносит собственный роутинг, middleware и модель сессий поверх
Nest, который всё это уже даёт, а выигрыш — шесть обёрток над `fetch`.
**Требует решения владельца репозитория:** `CLAUDE.md` запрещает добавлять зависимости
самостоятельно; здесь предлагается **не добавлять ни одной**, и это тоже решение,
которое надо подтвердить.

### 6.2 Webhook и проверка отправителя

- Регистрация: `setWebhook(url, secret_token, allowed_updates: ["message","callback_query"])`.
  `allowed_updates` сокращает поток апдейтов и объём разбора.
- URL: `https://<host>/api/telegram/webhook/<random-32>` — случайный сегмент пути
  как эшелон обороны; сам по себе он не считается защитой.
- **Обязательная проверка** заголовка `X-Telegram-Bot-Api-Secret-Token`:
  сравнение через `crypto.timingSafeEqual` с предварительной сверкой длин. Не совпало —
  `401`, лог `webhook_auth_failed`, разбор тела не начинается.
- Только после этого — разбор апдейта.

**Allowlist проверяется на сервере, до любой записи.** Inline-кнопку в группе может нажать
любой её участник — это свойство Telegram, а не гипотеза: кнопки видны всем, кто видит
сообщение. Поэтому на каждый `callback_query`:

```
1. secret-token OK?                        нет → 401
2. moderator WHERE telegram_user_id = from.id AND is_active   нет → answerCallbackQuery
                                                                    (show_alert, приватно)
                                                                  + лог, 0 записей в БД
3. переход разрешён из текущего статуса?   нет → alert «статус уже изменён»
4. транзакция
5. answerCallbackQuery с результатом
```

Порядок жёсткий: ни одна запись в БД не происходит раньше шага 2. Попытка постороннего
попадает в журнал системы, но **не** в публичную историю заявки (US-024).

### 6.3 Карточка: два сообщения

| # | Сообщение | Содержимое |
| --- | --- | --- |
| 1 | `sendMediaGroup` (1–3 фото) | Подпись на первом фото: номер, район, категория, ориентир, дата/время, ссылка на точку в Яндекс Картах, строка «⚠️ проверить: …» при сигналах антиабуза (US-025), строка «рядом: #12, #48» при найденных дублях (§3.2) |
| 2 | `sendMessage` ответом на #1 | Короткая строка статуса + inline-клавиатура. Это сообщение и редактируется при каждом переходе |

Два сообщения, а не одно: медиагруппа не может нести inline-клавиатуру. Два, а не три:
`sendLocation` дал бы нативную точку, но ссылка на Яндекс Карты в подписи открывает
приложение с тем же результатом и не добавляет третьего уведомления группе (US-027).
[требует проверки: удобнее ли бригаде нативная точка Telegram — добавление `sendLocation`
это один вызов, решение за бригадой после первых выездов]

`message_id` обоих сообщений сохраняются в `report` (§2.2): по ним находится заявка,
когда волонтёр отвечает фотографиями (§6.8).

Подпись медиагруппы ограничена 1024 символами: `landmark` (≤ 200) + служебные поля
укладываются с запасом; строка дублей обрезается до трёх номеров.

### 6.4 Кнопки и `callback_data`

Лимит `callback_data` — 64 байта. Формат: `1:<op>:<id>:<arg>`, где `1` — версия схемы
(чтобы старые кнопки в истории группы не вызывали неопределённого поведения после
изменения формата).

| Кнопка | `callback_data` | Пример |
| --- | --- | --- |
| Принять | `1:s:<id>:AC` | `1:s:1234:AC` |
| В работу | `1:s:<id>:IP` | |
| Вернуть в очередь | `1:s:<id>:AC` | тот же переход, кнопка называется иначе |
| Отклонить | `1:r:<id>` | открывает список причин |
| Дубль | `1:d:<id>` | запрашивает номер оригинала |
| Не по силам | `1:o:<id>` | открывает список причин |
| Причина (шаг 2) | `1:R:<id>:<code>` | `1:R:1234:UNREADABLE` |
| Отменить | `1:u:<historyId>` | окно 15 минут |

Клавиатура строится из текущего статуса по таблице переходов PRD §5.1. У терминальных
статусов кнопок переходов нет — остаётся только «Отменить», и только 15 минут (§6.10).

### 6.5 Двухшаговые переходы

`REJECTED`, `DUPLICATE`, `OUT_OF_SCOPE` требуют дополнительного поля (PRD §5.2).

- **Причина из списка.** Нажатие → `editMessageText` того же сообщения #2: вместо кнопок
  статусов — кнопки причин и «Назад». Новых сообщений в группе не появляется.
  Выбор причины → переход. Второе сообщение не создаётся, шум в группе нулевой.
- **«Другое» и номер оригинала** требуют текста. Бот отправляет сообщение с `ForceReply`
  и пишет строку в `bot_prompt` (§2.12). Ответ находится по
  `message.reply_to_message.message_id`; отвечать может **только** тот модератор,
  который начал переход (`bot_prompt.moderator_id`), проверка — на сервере.
  Просроченный (> 1 часа) prompt → «время истекло, начните заново».
- **Номер оригинала** проверяется: заявка существует, это не та же самая заявка,
  оригинал не в статусе `DUPLICATE` (иначе получится цепочка). Не прошло — сообщение
  об ошибке, переход не выполняется (US-021).

### 6.6 Актуальность карточки и одновременные нажатия

Каждый переход ставит в outbox запись `CARD_EDIT`. Перед вставкой удаляются неотправленные
`CARD_EDIT` этой же заявки: смысл имеет только последнее состояние.

Текст после перехода: статус, кто поставил (имя из `moderator.display_name` — внутри
группы это не тайна, публично не показывается, PRD §6.2), время.

Гонка двух модераторов решается в БД, а не оптимистичной проверкой в коде:

```sql
UPDATE report SET status = :next, updated_at = now()
 WHERE id = :id AND status = :expectedCurrent
RETURNING id;
```

Ноль строк → второй нажавший получает alert «статус уже изменён на X» (US-026, инвариант
PRD 5.3.6). Никакого `SELECT … FOR UPDATE` и никакой блокировки на время сетевого вызова.

### 6.7 Outbox: доставка при недоступном Telegram

Воркер — `setInterval` 10 с в том же процессе:

```
SELECT * FROM telegram_outbox
 WHERE sent_at IS NULL AND next_attempt_at <= now()
 ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED;
```

- Успех → `sent_at = now()`. Для `CARD_CREATE` дополнительно записываются `message_id`
  в `report`.
- Сетевая ошибка / 5xx → `attempts++`, backoff `10 с → 30 с → 2 мин → 10 мин → 30 мин`,
  далее каждый час бессрочно. Dead-letter нет: заявка обязана дойти (US-018).
- `429` с `retry_after` → `next_attempt_at = now() + retry_after`, `attempts` не растёт:
  это не ошибка, а расписание.
- `400 Bad Request` (сообщение удалено, чат недоступен) → `sent_at` ставится,
  `last_error` сохраняется. Бесконечно долбить заведомо мёртвый вызов бессмысленно.
- Старше 10 минут в очереди → алерт (§10.4).

`FOR UPDATE SKIP LOCKED` избыточен при одном процессе, но стоит ноль и делает
безопасным разворачивание второго экземпляра при отладке.

Создание заявки **никогда** не ждёт Telegram: запись в outbox идёт в той же транзакции,
что и заявка, а отправка — отдельно и позже.

### 6.8 Приём фото «после»

Правило: **фото ответом на карточку заявки** (US-030).

1. Пришло `message` с `photo` и `reply_to_message` → ищем заявку по
   `(chat_id, reply_to_message_id)` среди `telegram_album_message_id` и
   `telegram_card_message_id`.
2. Не нашли → ответ «отправьте фото ответом на карточку конкретной заявки» (US-030).
3. **Отправителя не проверяем по allowlist.** Фото «после» принимает любой участник
   группы — решение PRD §12.4, принято осознанно: требование быть модератором остановило
   бы закрытие заявок в поле. Риск для North Star закрывается закрытостью группы
   (вступление только по приглашению координатора), а не техникой.
4. Статус не `ACCEPTED` и не `IN_PROGRESS` → фото не принимаются, в ответ текущий статус
   и причина отказа (US-030). Заявка уже в `DONE` → фото **добавляются** до общего
   лимита 3, счётчик не растёт.
5. Альбом приходит несколькими апдейтами с общим `media_group_id`: буферизуем 2 секунды
   по этому ключу, затем обрабатываем разом, берём первые 3, об остальных отвечаем
   (US-028).
6. Скачивание и обработка — §5.5. Транзакция: `report_photo` × N + `UPDATE report SET
   status='DONE', done_at=now()` + `report_status_history` + `CARD_EDIT` в outbox.
7. Ответ волонтёру: «Заявка #1234 закрыта, спасибо» либо причина отказа.

### 6.9 Ссылка на публикацию

Ответ на карточку **без фото**, содержащий `http(s)`-URL, при статусе `DONE` →
`publication_url` перезаписывается целиком (US-029). Валидация: только `http`/`https`,
длина ≤ 512, ссылка не рендерится как HTML нигде. Заявка не в `DONE` → бот отвечает,
что ссылку можно приложить после закрытия.

### 6.10 Окно отмены — 15 минут

- Кнопка «Отменить» появляется на карточке после **терминального** перехода
  (`REJECTED`, `DUPLICATE`, `OUT_OF_SCOPE`, `DONE`) и несёт `historyId`.
- **Отменяет только автор перехода.** Для кнопочных переходов автор — модератор;
  для перехода в `DONE` автор — тот волонтёр, который прислал фото. PRD §5.4 говорит
  «модератор, совершивший переход», но переход в `DONE` совершает не модератор, и при
  буквальном чтении отменить ошибочно закрытую заявку было бы некому. Правило приводится
  к общему виду: **автор перехода**, кем бы он ни был. Сверка идёт по
  `report_status_history.actor_telegram_user_id`.
- Серверные проверки перед отменой: запись — последняя в истории заявки; прошло < 15 минут;
  `undone_at IS NULL`; `from.id = actor_telegram_user_id`.
- Эффект: новая строка истории с `undoes_history_id`, `undone_at` у отменяемой,
  `report.status` возвращается к `from_status`. Для `DONE` дополнительно `done_at = NULL` —
  счётчик уменьшается сам, потому что он считается запросом (инвариант PRD 5.3.2).
  Фото «после» остаются в БД, но публично не показываются: их публичность выводится
  из `status = 'DONE'`, отдельного флага нет.
- **Снятие кнопки через 15 минут** — без планировщика: при терминальном переходе в outbox
  кладётся вторая запись `CARD_EDIT` с `next_attempt_at = now() + 15 min`. Наступил срок —
  воркер перерисовал карточку уже без кнопки (PRD 5.4, последний критерий).
- Опоздавшее нажатие (кнопка ещё на экране у кого-то) → alert «окно отмены истекло».

### 6.11 Идемпотентность при повторной доставке

Telegram повторяет апдейт, если не получил `2xx`. Правила:

- `update_id` вставляется в `processed_update` **в той же транзакции**, что и эффект.
  Конфликт по PK → апдейт уже обработан, отвечаем `200` и ничего не делаем.
- Фото защищены вторым рубежом — `photo_dedup_idx` по `(report_id, kind, sha256)` (§2.4):
  тот же файл повторно не создаст строку даже при сбое первого рубежа.
- Переходы защищены третьим — условным `UPDATE … WHERE status = :expected` (§6.6):
  повтор не найдёт ожидаемый статус.
- **Код ответа осмысленный.** Транзиентная ошибка (БД недоступна, S3 недоступен) → `500`:
  пусть Telegram повторит. Логическая ошибка (неизвестная кнопка, неверный формат) →
  `200`: повтор ничего не изменит, а ретраи создадут шторм.
- `answerCallbackQuery` вызывается всегда, в том числе при отказе: иначе у нажавшего
  крутится «часики» до таймаута.

### 6.12 Когда Telegram недоступен

| Отказывает | Что продолжает работать | Что встаёт |
| --- | --- | --- |
| Bot API недоступен | Сайт, форма, карта, счётчик, `/z/<token>` | Доставка карточек (копится в outbox), модерация |
| Webhook не доставляется | Всё, кроме реакции на кнопки | Модерация; `getWebhookInfo` покажет `pending_update_count` (§10.4) |
| Бот удалён из группы | Всё, кроме доставки | Карточки уходят в `last_error`, алерт |

Модерация без Telegram в MVP невозможна — это принятый риск PRD §8.6. Аварийная веб-админка
запланирована в v1.1 и в этом SRS не проектируется.

---

## 7. Frontend

### 7.1 Структура `apps/web`

```
src/
  main.tsx              точка входа, провайдеры
  router.tsx            дерево маршрутов TanStack Router
  routes/
    $locale/
      index.tsx         карта + счётчик (главная)
      reports/index.tsx список с фильтрами
      reports/$id.tsx   карточка заявки
      new.tsx           форма подачи
      z/$token.tsx      страница отслеживания
  features/
    report-form/        форма, сжатие фото, черновик, honeypot
    report-map/         карта, кластеризация, bbox → запрос
    report-filters/     фильтры ↔ search-параметры
  entities/report/      api-клиент, queryKeys, маппинг кодов в тексты
  shared/
    api/                fetch-обёртка, разбор ошибок, X-Request-Id
    i18n/               словари uz/ru, хук перевода
    ui/                 кнопки, поля, состояния загрузки и пустоты
```

Слоёв ровно столько, сколько есть экранов. Заготовок каталогов «на будущее» нет
(`CLAUDE.md`).

### 7.2 Локаль как сегмент пути

- Дерево маршрутов начинается с `/$locale`, значение валидируется как `'uz' | 'ru'`;
  всё прочее → 404 → редирект на `/uz`.
- `/` без локали → редирект. Сайт — статический SPA, серверного рендера нет, поэтому
  заголовок `Accept-Language` коду недоступен; используется `navigator.languages`,
  который браузер формирует из тех же настроек. Первый элемент, начинающийся с `ru`,
  даёт `/ru`; всё остальное, включая отсутствие данных, — `/uz` (PRD US-015: узбекский
  по умолчанию).
- Переключатель языка меняет **только** сегмент локали, сохраняя путь и все
  search-параметры (US-015).
- nginx отдаёт `index.html` на любой неизвестный путь (SPA-fallback), иначе прямая ссылка
  `/ru/z/<token>` даст 404 от статики.
- `<html lang>` синхронизирован с локалью (PRD §8.2).
- Переводятся не только подписи кнопок, но и статусы, категории, причины отказа
  и названия районов: сервер отдаёт коды, словарь — на клиенте (§8.2).

### 7.3 Фильтры в search-параметрах

Источник истины по фильтрам — URL, а не состояние React. `validateSearch` маршрута
разбирает и нормализует параметры; невалидные значения отбрасываются, а не роняют
страницу.

```
/uz/reports?status=ACCEPTED,IN_PROGRESS&district=chilonzor&from=2026-08-01&to=2026-08-31
```

Следствия, ради которых это и делается: ссылку на срез можно переслать в группу (US-003,
US-031), «назад» в браузере возвращает предыдущий набор фильтров, а не сбрасывает его.
Отдельной библиотеки валидации не подключаем — разбор пяти параметров это функция
на 30 строк.

### 7.4 Карта и форма

- Яндекс JS API v3 грузится **только** на маршрутах с картой, динамическим `import()`:
  на `/z/<token>` карта не нужна, и её вес туда не попадает.
- Виджет выбора точки и тайлы — единственное, что берётся у Яндекса. Геокодер
  не вызывается ни при каких условиях (ADR-0004): адрес не хранится, район считает
  сервер.
- Доступная альтернатива перетаскиванию (PRD §8.2, US-007): кнопка «моё местоположение»
  и два числовых поля широты и долготы, связанных с тем же состоянием, что и пин.
- Геопозиция: `navigator.geolocation.getCurrentPosition` с таймаутом 10 с. Отказ —
  не ошибка: карта открывается на границах Ташкента, показывается подсказка про пин
  (US-002).
- Позиция вне 12 полигонов → карта остаётся на Ташкенте плюс сообщение (US-002);
  окончательное решение всё равно принимает сервер (§3.3).
- Кластеризация — `YMapClusterer`, порог и план на его превышение — §3.4.
  [требует проверки: наличие и API `YMapClusterer` в актуальной версии Яндекс JS API v3,
  а также условия использования тайлов для некоммерческой кампании — сверить с ADR-0004]

### 7.5 TanStack Query: ключи, staleTime, инвалидация

| queryKey | staleTime | Почему столько |
| --- | --- | --- |
| `['districts']` | `Infinity` | 12 строк, меняются только миграцией |
| `['categories']` | `Infinity` | То же; перезагрузка страницы обновит |
| `['stats']` | 30 с | PRD: счётчик обновляется за ≤ 60 с; 30 с даёт запас |
| `['reports','map',{bbox,filters}]` | 30 с | Пан/зум не должны бить в API на каждый кадр |
| `['reports','list',{filters,cursor}]` | 30 с | |
| `['reports','detail',id]` | 60 с | Статус меняется редко |
| `['track',token]` | 0 | Житель обновляет страницу именно чтобы увидеть новое |

Иерархия ключей — от общего к частному, чтобы инвалидация была точечной:

- успешная отправка формы → `invalidateQueries(['reports'])` + `invalidateQueries(['stats'])`;
- удаление контактов → `invalidateQueries(['track', token])`, и ничего больше;
- смена bbox — не инвалидация, а новый ключ: предыдущие области остаются в кэше,
  и возврат к ним мгновенен.

`refetchOnWindowFocus` выключен глобально: мобильный трафик платный (PRD §8.1),
а фокус на телефоне меняется постоянно.

### 7.6 Потеря сети и черновик

- Черновик формы (поля, координаты, **уже сжатые** фото как Blob, `Idempotency-Key`)
  кладётся в IndexedDB — в `localStorage` бинарные данные не помещаются.
- Живёт 24 часа, после чего удаляется при открытии формы (US-016).
- Восстановление показывает уведомление и кнопку «очистить».
- «Повторить» переиспользует тот же `Idempotency-Key` → сервер вернёт `200` с первым
  результатом, дубля не будет (§4.2).
- Карта без сети показывает сообщение об отсутствии связи, а не белый экран (PRD §8.4).

### 7.7 Бюджет трафика

700 КБ на первую загрузку карты (PRD §8.1), без тайлов. Распределение:
React + Router + Query ≈ 180 КБ br, Tailwind (после purge) ≈ 15 КБ, код приложения
≈ 80 КБ, Яндекс JS API — внешний, грузится отдельно и в бюджет не входит, точки карты —
до 450 КБ (§3.4). Проверка — отчёт размера бандла в CI с жёстким порогом на сборку;
превышение ломает сборку, а не остаётся замечанием в ревью.

---

## 8. Ошибки

### 8.1 Единый формат ответа

```json
{ "error": {
    "code": "OUTSIDE_TASHKENT",
    "message": "Point is outside all 12 Tashkent district polygons",
    "correlationId": "01J9F7K2W8N4Q3",
    "details": [ { "field": "photos", "code": "PHOTOS_REQUIRED" } ] } }
```

- `code` — стабильный машинный ключ. Union-тип в `packages/shared-types`, обе стороны
  импортируют один и тот же список (ADR-0006). Клиент переключается по нему; добавление
  нового кода без обновления словаря локали ломает типизацию на этапе `pnpm typecheck`,
  а не в проде.
- `message` — **для разработчика**, на английском. В UI не показывается никогда:
  иначе житель увидит английский текст, а перевод серверных строк потребовал бы
  словарей на сервере.
- `details` — только для `VALIDATION_FAILED`: список пар «поле → код», чтобы форма
  подсветила конкретное поле и перевела фокус (US-006).
- `correlationId` — §8.3.

### 8.2 Отображение в UI

| Класс | HTTP | Что видит пользователь |
| --- | --- | --- |
| Валидация | 400 `VALIDATION_FAILED` | Текст у поля, фокус на первом проблемном (US-006) |
| Геозабор | 400 `OUTSIDE_TASHKENT` | Сообщение на карте: кампания работает только в Ташкенте (US-017) |
| Не найдено | 404 `NOT_FOUND` | «Заявка не опубликована» / «ссылка не найдена» — одинаково для несуществующей и удалённой (US-013) |
| Слишком большой файл | 413 | Фактический и допустимый размер (US-008) |
| Формат | 415 | Список поддерживаемых форматов |
| Лимит | 429 | «Слишком много попыток, повторите через N» |
| Сеть / 5xx | — | Кнопка «повторить» + сохранённый черновик (US-016) |

Локализация — словарь `code → строка` на каждую локаль. Свободный текст модератора
(причина «другое») не переводится и показывается как введён, о чём написано рядом.

### 8.3 Correlation id

- Идентификатор берётся из заголовка `X-Request-Id`, если клиент его прислал, иначе
  генерируется (26 символов, монотонный по времени).
- Хранится в `AsyncLocalStorage` (`node:async_hooks`) — сквозной прокид через параметры
  не нужен, дополнительная зависимость тоже.
- Возвращается в заголовке ответа **и** в теле ошибки: житель может назвать его
  в обращении, разработчик — найти запрос в логе одной командой.
- Для апдейтов Telegram роль correlation id играет `update_id`, а `report_id`
  пишется в лог рядом.

### 8.4 Структурные логи

JSON в stdout, один объект на строку. Забирает `docker logs`
(`json-file`, `max-size=10m`, `max-file=3` — на диске максимум 30 МБ на контейнер).

```json
{"ts":"2026-08-10T09:12:44.101Z","level":"warn","msg":"report_rejected_geofence",
 "correlationId":"01J9F7K2W8N4Q3","route":"POST /api/reports","status":400,
 "durMs":38,"district":null,"ipPrefix":"84.54.66.0/24"}
```

Обязательные поля: `ts`, `level`, `msg` (snake_case-событие, не предложение),
`correlationId`. Ситуативные: `route`, `status`, `durMs`, `reportId`, `updateId`,
`moderatorId`, `rule`.

**Чего в логах нет никогда:** `tracking_token`, телефон, Telegram-ник заявителя, полный
IP (только `/24`), содержимое фото, тело `multipart`. Список — часть чек-листа ревью
(§13).

Уровни: `error` — сломалось и нужен человек; `warn` — ожидаемый отказ (геозабор, лимит,
чужая кнопка); `info` — переходы статусов, отправка карточек, старт/остановка;
`debug` — только вне прода.

---

## 9. Безопасность

### 9.1 Модель угроз в одну строку

Авторизации нет, аккаунтов нет, денег нет. Ценность для атакующего: испортить очередь
кампании, накрутить или обнулить счётчик, вытащить контакты заявителей, положить сервис
на 2 ГБ, залить вредоносный файл. Всё остальное — шум.

### 9.2 IDOR: заявки и tracking-токены

- `report.id` последователен и публичен **по замыслу**: заявки и так публичны (PRD §6).
  Перебор даёт то же, что и карта.
- `REJECTED` и `DUPLICATE` по прямой ссылке → `404`, неотличимо от несуществующей
  заявки (US-004). Скрывается не только тело, но и сам факт существования.
- **Токен — единственная capability в системе.** Он даёт: причину отказа, ссылку
  на оригинал дубля и кнопку удаления контактов. Он не даёт менять статус и не показывает
  сами контакты (§4.5).
- **Утечка через `Referer`.** Токен лежит в пути URL, а страница `/z/<token>` подключает
  внешние ресурсы (Яндекс JS API, тайлы). По умолчанию браузер отправил бы им
  `Referer: https://ravonroad.uz/uz/z/<token>` — то есть токен ушёл бы третьей стороне
  в логи. Поэтому на весь сайт ставится `Referrer-Policy: no-referrer`. Это не
  перестраховка, а закрытие реального канала утечки.
- `Cache-Control: no-store` на ответах `/api/track/*`, чтобы токен не оседал
  в промежуточных кэшах.
- Токен не появляется ни в логах, ни в метриках, ни в карточке Telegram.
- Постоянное время сравнения не требуется: 128 бит энтропии и лимит 30 запросов/мин
  делают тайминг-атаку бессмысленной раньше, чем она станет измеримой.

### 9.3 Подделка webhook

- `X-Telegram-Bot-Api-Secret-Token`, сравнение `timingSafeEqual` — §6.2. **Обязательно**:
  без него любой, кто узнал URL, меняет статусы чужих заявок.
- Случайный сегмент пути — второй эшелон, самостоятельной защитой не считается.
- Токен бота хранится только в `.env` на хосте, в образ не попадает, в логи не пишется.
- [требует проверки: актуальные диапазоны адресов Telegram (`149.154.160.0/20`,
  `91.108.4.0/22`) — если подтвердятся, добавить `allow`/`deny` в nginx как третий
  эшелон; полагаться на них как на основную защиту нельзя]
- Webhook — единственный `POST`, принимающий команды на изменение данных без участия
  пользователя. Он же — самая ценная цель; отсюда три независимых рубежа.

### 9.4 Нажатие кнопок посторонними

Кнопки видны всем участникам группы — свойство Telegram. Защита исключительно серверная:
сверка `from.id` с таблицей `moderator` **до любой записи** (§6.2), приватный alert
нажавшему, запись в журнал, ноль следов в публичной истории (US-024).

Клавиатура, спрятанная от «неправильных» пользователей, невозможна: Telegram не даёт
персональных клавиатур в групповом сообщении. Любая схема, полагающаяся на «он не увидит
кнопку», нерабочая по построению.

### 9.5 Лимиты при CGNAT — стратегия

Узбекистанские операторы держат абонентов за CGNAT: один публичный адрес соответствует
сотням независимых людей (PRD §10.4). Жёсткий лимит по IP отрезает не нарушителя,
а целый район. При этом совсем без лимитов сервис на 2 ГБ кладётся одним скриптом.

Разделение по принципу: **жёсткий лимит ставится только там, где законная нагрузка
на одного человека равна примерно единице, и порог берётся на порядок выше.**

| Ресурс | Законное поведение | Мягкий порог (флаг) | Жёсткий порог (отказ) | Обоснование |
| --- | --- | --- | --- | --- |
| `POST /api/reports` | 1–3 заявки за сессию | **10/час** → `abuse_signal` | **60/час** | 60 — это DoS-барьер, а не антиспам: за CGNAT 60 заявок в час от разных людей означало бы 20 заявок в неделю от одного дома |
| `GET /api/track/:token` | 1–2 запроса на заявку | — | **30/мин** | Единственная защита от перебора токенов; законный пользователь не делает и десяти |
| `POST /api/form-opens` | ≤ несколько в час | — | **60/час** | Счётчик, порча которого ничего не стоит, но и заливать его незачем |
| `GET` карта/список | десятки при активном использовании | — | **300/мин** | Порог выше любого ручного использования |

Дополнительно — меры, **не зависящие от адреса** и потому безопасные при CGNAT: предел
тела запроса (8 МБ), таймаут (30 с), семафор на 2 конвейера обработки фото (§5.6),
`connection_limit` пула Prisma, лимиты памяти контейнеров (§12).

Состояние лимитов — в памяти процесса (`Map` + скользящее окно). Redis не заводится:
процесс один. **Потолок:** при появлении второго экземпляра лимиты станут
per-instance — тогда либо sticky-балансировка, либо общее хранилище счётчиков.

Капчи нет; условия её появления зафиксированы в PRD §10.5 и здесь не дублируются.

### 9.6 Вредоносные файлы

| Вектор | Мера |
| --- | --- |
| Полиглот (JPEG + HTML/JS) | Всё **перекодируется** через sharp; исходные байты не сохраняются никогда |
| Декомпрессионная бомба | `limitInputPixels: 50_000_000`, лимит размера файла |
| SVG с внешними сущностями | SVG не принимается ни на каком этапе |
| Подмена `Content-Type` | Проверка magic bytes; заявленный тип игнорируется |
| XSS через отдачу файла | `Content-Type: image/jpeg` в S3, `X-Content-Type-Options: nosniff`, отдача с отдельного домена бакета |
| Исчерпание диска/памяти | Лимиты размера и семафор §5.6 |
| Метаданные (GPS дома заявителя) | EXIF вырезается целиком, §5.3 |

### 9.7 Спуфинг координат

Координаты приходят из браузера и достоверными не являются: `navigator.geolocation`
подделывается флагом DevTools, а пин ставится пальцем куда угодно. Что из этого следует:

- Сервер **всегда** пересчитывает район сам; значение района из клиента не принимается
  ни в каком виде (US-007).
- Геозабор — серверная проверка, а не подсказка в UI (PRD §10.1).
- Точность координат внутри города технически не проверяема. Барьер здесь не технический:
  заявка требует фотографии, а решение принимает модератор по фото. Ложная координата
  с настоящим фото даёт бригаде поездку впустую — это цена, которую закрывает
  `REJECTED` и, при повторении, состав закрытой группы.
- Специально **не делаем**: сверку координат с EXIF (PRD §7.2 запрещает читать EXIF)
  и «проверку правдоподобности» перемещений — построение профиля заявителя запрещено
  PRD §9.4.

### 9.8 Прочее

- **CORS** — `origin: WEB_ORIGIN` списком, без `*`, без `credentials` (их нет).
- **CSRF неприменим:** cookie и сессий не существует, авторизации нет; менять состояние
  без токена/allowlist невозможно.
- **CSP** (заголовок nginx): `default-src 'self'; img-src 'self' data: <s3-host>;
  script-src 'self' https://api-maps.yandex.ru; connect-src 'self' https://*.yandex.ru
  https://*.yandex.net <s3-host>; frame-ancestors 'none'; base-uri 'none'`.
  [требует проверки: точный перечень доменов, которые Яндекс JS API v3 запрашивает
  под тайлы — уточняется по факту в консоли браузера]
- Прочие заголовки: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `Permissions-Policy: geolocation=(self), camera=()`.
- **Секреты** — только в `.env` на хосте и в GitHub Secrets. В образ не запекаются,
  в логи не попадают. Ротация токена бота и ключей S3 — процедура на стороне владельца
  кампании.
- **Сроки хранения.** `created_ip` — 30 дней. Контакты — 90 дней после терминального
  статуса (PRD §9.2.5). Обе чистки — одна суточная задача, один `DELETE`/`UPDATE`.
  [требует проверки: требования законодательства Узбекистана к срокам хранения
  и к уведомлению оператора персональных данных — PRD §9.2.5, BRD §6]
- **Dev-среда в us-central1** не содержит и не будет содержать данных настоящих
  заявителей: только синтетические сиды. Это правило, а не наблюдение, — см. §15.

---

## 10. Наблюдаемость

### 10.1 Health и readiness

| Эндпоинт | Проверяет | Ответ |
| --- | --- | --- |
| `GET /health` | Процесс жив, event loop отвечает | `200 {"status":"ok","uptimeS":…}` — всегда, если процесс работает |
| `GET /ready` | `SELECT 1` к БД (таймаут 2 с) | `200` / `503 {"db":"down"}` |
| `GET /health/details` | БД, S3 (`HEAD` бакета, кэш 60 с), Telegram (`getWebhookInfo`, кэш 60 с), глубина outbox, возраст последнего апдейта | `200` со сводкой |

Readiness намеренно проверяет **только БД**: сайт обязан работать при недоступном Telegram
(PRD §8.6) и продолжает отдавать карту при недоступном S3 (фото не откроются, страница
останется). Включение их в readiness выключало бы работающий сервис из-за чужого сбоя.

`/health/details` не содержит секретов и персональных данных, поэтому доступен без
авторизации — заводить единственный в системе секрет ради страницы диагностики
несоразмерно.

### 10.2 Что логируем

Перечень полей и запретов — §8.4. События, которые обязаны быть в логе:

`report_created`, `report_rejected_geofence`, `report_rate_flagged`, `status_changed`,
`status_undone`, `unauthorized_button_press`, `webhook_auth_failed`, `photo_rejected`,
`outbox_send_failed`, `telegram_unavailable`, `contacts_deleted`, `db_unavailable`.

### 10.3 Что метрим

Prometheus и Grafana не разворачиваются: ~250 МБ памяти при бюджете §12 — цена
несоразмерная. Все нужные числа выводятся SQL-запросами по `report`
и `report_status_history`, потому что данные и есть метрики:

| Метрика | Источник |
| --- | --- |
| P-1 конверсия формы | `form_open_counter` ÷ `COUNT(report)` за день |
| P-2 доля отказов геозабора | счётчик `report_rejected_geofence` в логах за период |
| P-3 доля заявок с флагом | `abuse_signal` ÷ `report` |
| P-4 `DONE` без фото «после» | инвариантный запрос, обязан возвращать 0 строк |
| P-5 доля с определённым районом | Структурно 100%: `district_code` объявлен `NOT NULL` (§2.2), а заявка без района не создаётся (§3.3). Запрос `district_code IS NULL` остаётся как страховка от миграции, ослабившей ограничение |
| P-6 медиана `NEW` → первое решение | `report_status_history`, оконная функция |
| North Star, BRD §8 | `COUNT(*) WHERE status='DONE'`, медиана `NEW`→`DONE` |

Набор запросов лежит в репозитории как файл `docs/metrics.sql` и запускается вручную
раз в неделю. Автоматизация — когда координатор начнёт делать это чаще.

### 10.4 Как узнаём, что бот перестал получать апдейты

Тишина в webhook неотличима от «в группе ничего не происходит», поэтому пассивное
наблюдение здесь не работает. Нужна активная проверка — каждые 5 минут:

```
getWebhookInfo → { url, pending_update_count, last_error_date, last_error_message }
```

Алерт, если выполняется любое:

| Условие | Что означает |
| --- | --- |
| `url` пуст или не наш | Webhook сброшен (перерегистрация, чужой `setWebhook`) |
| `pending_update_count > 20` | Telegram копит апдейты — мы их не забираем |
| `last_error_date` моложе 10 минут | Telegram получает от нас ошибки |
| Старейшая неотправленная запись outbox старше 10 минут | Мы не можем отправлять |
| `/ready` отдаёт 503 дважды подряд | БД недоступна |

**Куда идёт алерт:** сообщением того же бота в отдельный приватный чат координатора
(`TELEGRAM_ALERT_CHAT_ID`), дедупликация — не чаще одного сообщения на условие в час.
Внешняя система мониторинга не разворачивается: канал доставки уже есть и уже оплачен.
Слабое место известно и принимается: если недоступен сам Telegram, алерт о его
недоступности не дойдёт. Второй канал — внешний uptime-пинг на `/health`
[требует проверки: какой бесплатный внешний пинг допустим и не нарушает ли он
приватность — достаточно проверки доступности без содержимого].

### 10.5 Резервные копии

`pg_dump` раз в сутки, gzip, в тот же Cloupard S3 под отдельным префиксом, хранение
14 копий. Проверка восстановления — раз в квартал на dev-машине. Фотографии не бэкапятся
отдельно: S3 и есть их хранилище, а повторной загрузки исходников не существует.
[требует проверки: гарантии сохранности и версионирование объектов у Cloupard S3]

---

## 11. Тестовая стратегия

Тестовый раннер `CLAUDE.md` объявляет невыбранным. **Рекомендация: Vitest** — Vite уже
стоит в `apps/web`, конфигурация переиспользуется, для `apps/api` он работает без
дополнительной сборки. Решение и установку devDependency подтверждает владелец репозитория.

### 11.1 Пирамида

| Уровень | Чем | Где | Сколько |
| --- | --- | --- | --- |
| Unit | Vitest, без БД и сети | `apps/api`, `apps/web`, `packages/shared-types` | Основная масса |
| Integration | Vitest + Testcontainers (`postgis/postgis:17-3.5`) | `apps/api` | Всё, что трогает SQL, гео и транзакции |
| E2E | Playwright, только в CI | Отдельный пакет | 3 сценария, не больше |

### 11.2 Unit — что покрываем обязательно

- Таблица переходов PRD §5.1 — включая **все** запрещённые переходы: для каждой пары
  «статус × действие» проверяется разрешение или отказ. Это ядро продукта.
- Кодек `callback_data`: сериализация, разбор, версия схемы, отказ на мусор, лимит 64 байта.
- Курсор: кодирование, декодирование, устойчивость к мусору, границы.
- Генерация токена: длина, алфавит, отсутствие повторов на 10⁶ выборках.
- Sniffer magic bytes: JPEG/PNG/WebP принимаются, HEIC/SVG/PDF/ZIP/пустой файл — нет.
- Скользящее окно лимитов: границы, обнуление, независимость адресов.
- Разбор search-параметров фильтров: мусор отбрасывается, страница не падает.
- Формат ошибки: каждый `code` из union имеет строку в обеих локалях (тест на полноту
  словарей).

### 11.3 Integration — на Testcontainers

Один контейнер PostGIS на весь прогон (не на тест), миграции и сид накатываются как в проде,
между тестами — `TRUNCATE ... RESTART IDENTITY CASCADE`.

- **Гео:** контрольные точки районов; **эксклав Мирзо-Улугбекского** →
  `mirzo-ulugbek` (опорная точка `69.454308, 41.413567`, §2.14); Самарканд и Чирчик →
  `null`; ни одна контрольная точка не в двух районах; сумма `area_ha` 12 строк совпадает
  с датасетом в пределах 0,1%.
- **Геозабор:** `POST /api/reports` с точкой вне города → `400`, в БД ноль строк,
  в S3 ноль объектов.
- **Дубли:** 30 м находятся, 300 м нет; `REJECTED` в выдачу не попадает.
- **Создание заявки:** транзакционность (сбой на шаге фото → нет ни заявки, ни истории,
  ни outbox); идемпотентность по `Idempotency-Key`.
- **Инварианты:** `DONE` без фото «после» невозможен ни через один путь; четвёртое фото
  отклоняется индексом; двойная отмена одного перехода отклоняется индексом;
  `duplicate_of_id` на саму себя отклоняется `CHECK`.
- **Счётчик:** переход в `DONE` увеличивает, отмена уменьшает, `DUPLICATE`/`REJECTED`/
  `OUT_OF_SCOPE` не меняют.
- **Гонка:** два одновременных перехода — один применён, второй получает отказ.
- **Пагинация:** вставка новых заявок между страницами не даёт ни дублей, ни пропусков.
- **Приватность ответов:** снимок формы ответа каждого публичного эндпоинта; появление
  `contact*`, `tracking_token`, `created_ip` ломает тест.
- **Telegram** заменяется локальным HTTP-сервером на `node:http`, подставляемым
  через базовый URL Bot API. Проверяются: идемпотентность по `update_id`, чужое нажатие,
  неверный secret-token, backoff outbox, отложенное снятие кнопки отмены (с подменой
  времени, а не ожиданием 15 минут), приём альбома из нескольких апдейтов.

### 11.4 E2E — три сценария

1. Житель: открыть форму → фото → пин → категория → отправить → увидеть номер и ссылку →
   заявка появилась на карте и в списке.
2. Житель: открыть `/z/<token>` → увидеть статус → удалить контакты → контактов нет.
3. Локали: `/` → редирект на `/uz` → переключение на `/ru` сохраняет путь и фильтры.

Яндекс Карты в E2E заглушаются: сеть до внешнего сервиса делает тест зависимым от чужой
доступности. Проверяется, что координаты попали в форму, а не что нарисовался тайл.
Playwright запускается **только в CI** — на dev-машине с 1 ГБ браузер не поместится (§12).

### 11.5 Что не тестируем и почему

| Не тестируем | Почему |
| --- | --- |
| Рендер тайлов и виджета Яндекса | Внешний сервис, стабильных точек привязки нет; проверка сводилась бы к «интернет работает» |
| Доставку сообщений самим Telegram | Наша граница — вызов Bot API; за ней чужая зона ответственности |
| Долговечность S3 | Гарантия провайдера, не наш код |
| Нагрузку | Базовой линии не существует; NFR PRD §8.1 проверяется один раз перед запуском на сиде из 5000 заявок + прогон Lighthouse |
| Визуальные регрессии | Скриншотные тесты требуют инфраструктуры и постоянного обновления эталонов; при трёх экранах дешевле посмотреть глазами |
| Полноту переводов «на глаз» | Заменено на unit-тест равенства множеств ключей uz/ru |
| Сам GeoJSON | Проверен при сборке датасета (`data/geo/README.md`); тесты проверяют, что мы им правильно **пользуемся** |

---

## 12. Ресурсный бюджет

Обязательный раздел: 2 ГБ и 1 ГБ — жёсткое ограничение (`CLAUDE.md`), а не пожелание.
Обе среды поднимаются одним `docker-compose`, различаясь только файлом лимитов
и переменными.

### 12.1 Прод — VPS AHOST, 2 ГБ

| Контейнер | `mem_limit` | Ключевые настройки |
| --- | --- | --- |
| `db` (postgres + postgis) | **640 МБ** | `shared_buffers=192MB`, `work_mem=4MB`, `maintenance_work_mem=64MB`, `effective_cache_size=768MB`, `max_connections=20`, `huge_pages=off` |
| `api` (node 22) | **512 МБ** | `--max-old-space-size=320`, `VIPS_CONCURRENCY=1`, `sharp.cache({memory:32})`, семафор фото = 2, Prisma `connection_limit=8` |
| `edge` (nginx) | **96 МБ** | `worker_processes=1`, gzip/brotli на статику |
| **Итого лимитов** | **1248 МБ** | |
| ОС + dockerd | ~350 МБ | |
| Свободно | **~450 МБ** | Page cache Postgres, пики sharp, `pg_dump` |

Swap 2 ГБ обязателен — как страховка от OOM-kill при пике, не как рабочая память.

### 12.2 Dev — GCE e2-micro, 1 ГБ

| Контейнер | `mem_limit` | Отличия от прода |
| --- | --- | --- |
| `db` | **320 МБ** | `shared_buffers=96MB`, `work_mem=2MB`, `max_connections=10` |
| `api` | **288 МБ** | `--max-old-space-size=192`, семафор фото = 1 |
| `edge` | **64 МБ** | |
| **Итого** | **672 МБ** | |
| ОС + dockerd | ~250 МБ | |
| Свободно | **~80 МБ** | |

Правила, без которых 1 ГБ не живёт:

1. **Образы не собираются на сервере.** Сборка — GitHub Actions, публикация в GHCR,
   на машине только `docker pull`. `docker build` на e2-micro упирается в память и
   в 0,25 vCPU baseline.
2. **Миграции — одноразовый контейнер** (`docker compose run --rm migrate`), который
   завершается и освобождает память; постоянного контейнера под них нет.
3. **Никаких Playwright, Testcontainers и `pnpm install` на серверах.** Тесты — только
   в CI.
4. `pg_dump` на dev не запускается: восстанавливать нечего.
5. Логи ограничены драйвером (`max-size=10m`, `max-file=3`), иначе диск e2-micro
   заканчивается раньше памяти.
6. Swap 1 ГБ обязателен.

### 12.3 Что упрётся первым

Первым кончается память Postgres при росте активного набора данных. При 10 000 заявок
таблицы и индексы занимают единицы десятков мегабайт, то есть весь рабочий набор
помещается в `shared_buffers` — до цели кампании расширение не требуется.

Второй кандидат — пик sharp при одновременных отправках. Он ограничен семафором (§5.6)
осознанно: при всплеске мы предпочитаем `429` и повтор через минуту падению контейнера.

Ни один компонент не рассчитан на горизонтальное масштабирование: лимиты и дедупликация
альбомов держат состояние в памяти процесса (§9.5, §6.8). Это записано здесь явно, чтобы
второй экземпляр не подняли «на всякий случай» — он молча сломает и то, и другое.

---

## 13. Definition of Done для задачи

Задача (одна строка `tasks.md` внутри среза `specs/NNN-slug/`) считается сделанной, когда
выполнено **всё** перечисленное. Пункт, к задаче не относящийся, отмечается «н/п» явно —
не молча.

**Функциональность**
- [ ] Критерии Given/When/Then соответствующей US выполняются на живом стенде, а не
      «должны выполняться».
- [ ] Обработаны пустое состояние, ошибка и состояние загрузки — не только счастливый путь.

**Код**
- [ ] `pnpm typecheck` и `pnpm lint` зелёные. Не прошло — чинится, а не объясняется.
- [ ] Ни одного `any`. Общие типы — в `packages/shared-types`, дубля типа на стороне нет.
- [ ] Ничего «на будущее»: ни абстракций под одну реализацию, ни заготовок, ни TODO-заглушек.
- [ ] Новая зависимость не добавлена без отдельного согласования.

**Тесты**
- [ ] Новая логика ветвлений покрыта unit-тестом; новый SQL/гео/транзакция — интеграционным.
- [ ] Тесты падают, если убрать реализацию (проверено вручную хотя бы для одного).

**Данные и приватность**
- [ ] Миграция обратима либо снабжена планом отката; прогнана на копии дампа прода.
- [ ] Новое поле с персональными данными отсутствует — или внесено в PRD §9 и в §9.8 SRS
      со сроком хранения.
- [ ] Ответ нового публичного эндпоинта не содержит контактов, токена, IP и сигналов
      антиабуза (тест на форму ответа).

**Безопасность и ресурсы**
- [ ] Для нового эндпоинта принято и записано решение о лимите (§9.5).
- [ ] В логи не добавлено ничего из запретного списка §8.4.
- [ ] Не появилось постоянно работающего процесса или контейнера без строки в §12.

**Интерфейс** (если задача трогает `apps/web`)
- [ ] Строки есть в обеих локалях — `uz` и `ru`; статусы, категории и причины тоже.
- [ ] Проходится с клавиатуры, фокус виден, у полей есть связанные подписи (PRD §8.2).
- [ ] Бюджет бандла не превышен (§7.7).
- [ ] Проверено на ширине 360 px.

**Документация и процесс**
- [ ] Архитектурное решение (схема БД, границы модулей, внешняя зависимость, протокол)
      сопровождено ADR в том же изменении.
- [ ] Расхождение реализации с SRS/PRD либо устранено, либо документ поправлен здесь же.
- [ ] Новый термин внесён в `docs/domain/glossary.md` **до** появления в коде.
- [ ] Ветка от `dev`, Conventional Commits, PR в `dev`, CI зелёный, один ревьюер.

---

## 14. Трассировка US → разделы SRS

| US | Название | Разделы SRS |
| --- | --- | --- |
| US-001 | Карта заявок | §3.1, §3.4, §4.4, §7.4 |
| US-002 | Своя геопозиция | §7.4 |
| US-003 | Фильтры с состоянием в URL | §4.3, §7.3 |
| US-004 | Карточка заявки | §4.4, §2.7, §9.2 |
| US-005 | Публичный счётчик | §4.6, §2.2 |
| US-006 | Отправка без регистрации | §4.2, §8.2, ADR-0005 |
| US-007 | Координаты пином | §3.3, §7.4, §9.7 |
| US-008 | Фото «до» | §5.2, §5.3, §2.4 |
| US-009 | Ориентир | §2.2, §6.3 |
| US-010 | Категория | §2.5, §4.2 |
| US-011 | Необязательный контакт | §2.2, §4.2, §9.8 |
| US-012 | Ссылка отслеживания | §2.3, §4.2 |
| US-013 | Страница отслеживания | §4.5, §9.2 |
| US-014 | Удаление контактов | §4.5, §2.2 |
| US-015 | Локали | §7.2, §8.2 |
| US-016 | Потеря сети при заполнении | §4.2, §7.6 |
| US-017 | Геозабор | §3.3, §5.3, §9.7 |
| US-018 | Карточка новой заявки в группе | §6.3, §6.7, §6.12 |
| US-019 | Принять заявку | §6.4, §6.6 |
| US-020 | Отклонить с причиной | §6.5, §2.2 |
| US-021 | Пометить дубль | §6.5, §2.2, §3.2 |
| US-022 | Пометить как не по силам | §6.5, §4.3 |
| US-023 | Взять в работу | §6.4 |
| US-024 | Кнопки только для allowlist | §6.2, §2.8, §9.4, ADR-0005 |
| US-025 | Видимость флага антиабуза | §2.9, §6.3 |
| US-026 | Актуальность карточки | §6.6, §6.7 |
| US-027 | Навигация по координатам | §6.3 |
| US-028 | Фото «после» закрывает заявку | §6.8, §5.5, §2.4 |
| US-029 | Ссылка на публикацию | §6.9, §2.2 |
| US-030 | Понятный отказ | §6.8 |
| US-031 | Очередь по районам | §4.3, §2.6, §7.3 |
| US-032 | Публичный реестр `OUT_OF_SCOPE` | §4.3, §4.4 |
| US-033 | Выборка `DONE` за период | §4.3, §2.2 |

Обратная проверка: разделы §1, §8, §10, §11, §12, §13 не привязаны к отдельной US —
они обслуживают нефункциональные требования PRD §8 и эксплуатацию. Разделов, не покрытых
ни US, ни NFR, ни явным решением PRD/BRD, в документе нет.

---

## 15. Запрет биометрической обработки — навсегда

**Распознавание лиц и автомобильных номеров в RavonRoad не внедряется никогда.**
То же относится к ML-детекции ям по фотографии как к первому шагу в эту сторону.
Запрет не привязан к версии продукта: он не пересматривается ни в v1.1, ни в v2,
ни при смене команды.

**Почему это не вопрос вкуса.** Изображение лица, обработанное для целей идентификации,
и распознанный автомобильный номер — биометрические и персональные данные по
законодательству Узбекистана о персональных данных (ЗРУ-547). Их обработка тянет за
собой требование хранить данные граждан Узбекистана на территории страны и режим
оператора персональных данных с уведомлением и проверками.

**Что это делает с текущей инфраструктурой.** Сегодня она легальна именно потому, что
система почти ничего не обрабатывает: контакты необязательны, EXIF вырезается, профиль
заявителя не строится, а dev-среда стоит в `us-central1` и содержит только синтетические
данные. Внедрение распознавания разом:

1. переводит фотоархив в категорию биометрических данных;
2. делает хранение в Cloupard S3 предметом отдельной проверки локализации
   [требует проверки: юрисдикция и физическое размещение серверов Cloupard S3];
3. делает **невозможной** любую обработку продовых данных на GCE в `us-central1`,
   то есть обнуляет dev-среду в её нынешнем виде;
4. требует правового основания на обработку — которого у волонтёрской кампании,
   принимающей анонимные заявки, нет и не может быть.

Иными словами, одна фича стоимостью в неделю обнуляет легальность всей текущей
инфраструктуры. Это несоразмерно любой пользе от автоматической разметки фотографий.

**Как запрет реализован практически:**

- EXIF не читается никогда, координаты берутся только из Geolocation API и пина
  (PRD §7.2, §5.3);
- фотографии перекодируются без метаданных;
- никаких ML-библиотек, моделей и внешних API анализа изображений в зависимостях;
- задача, требующая распознавания, отклоняется на ревью со ссылкой на этот раздел;
- крайние случаи (человек или номер занимает заметную часть кадра) решает модератор
  глазами: `REJECTED` с причиной «фото непригодно для решения» либо ручное удаление
  фотографии (PRD §9.3).

Соответствующие статьи ЗРУ-547 о биометрических данных и о локализации хранения
подлежат точной сверке юристом [требует проверки]. Сверка может уточнить формулировки —
но не отменяет запрет: он принят как продуктовое решение (PRD §11.4) независимо
от исхода правовой проверки.

---

## 16. Сводка «требует проверки»

| # | Что проверить | Где влияет | Блокирует |
| --- | --- | --- | --- |
| 1 | Условия использования Яндекс JS API v3 и тайлов для некоммерческой кампании; формулировка про хранение геоданных ≤ 30 дней | ADR-0004, §7.4 | Запуск карты |
| 2 | Наличие и API `YMapClusterer` в актуальной версии JS API v3 | §3.4, §7.4 | Первый срез карты |
| 3 | Отдаёт ли iOS Safari HEIC или уже JPEG через `input[type=file]` | §5.2 | Форма на iPhone |
| 4 | Разрешение и качество фото после сжатия Telegram | §5.5 | Публикация «до/после» |
| 5 | Актуальные диапазоны адресов Telegram | §9.3 | Нет, это доп. эшелон |
| 6 | Cloupard S3: юрисдикция, версионирование, CORS, лимиты, формат endpoint/region | §5.4, §10.5, §15 | Первый срез загрузки фото |
| 7 | Архитектура VPS AHOST (amd64/arm64) — от неё зависит наличие prebuilt-бинарей sharp | §5.3, §12.1 | Первая сборка образа |
| 8 | ЗРУ-547: статьи о биометрии и локализации хранения | §15, §9.8 | Нет; запрет действует и без сверки |
| 9 | Требования к сроку хранения контактов и уведомлению оператора ПД | §9.8, PRD §9.2.5 | Нет; 90 дней действуют как проектное решение |
| 10 | Реальный разброс пинов у заявителей — радиус поиска дублей | §3.2 | Нет; 50 м — стартовый ориентир |
| 11 | Реальные размеры NAT-пулов операторов — пороги лимитов | §9.5, PRD §10.4 | Нет; пересмотр на 30-й день |
| 12 | Согласие владельца кампании на подсчёт конверсии своими средствами | §2.13, PRD §12.7 | Метрику P-1 |
| 13 | Устойчивость доступа к Telegram у операторов Узбекистана без VPN | §6.12, PRD §12.1 | Решение о переносе админки из v1.1 в MVP |
| 14 | Точный список доменов, запрашиваемых JS API v3 (для CSP) | §9.8 | Настройку заголовков |
| 15 | Допустимый внешний uptime-пинг | §10.4 | Нет |
| 16 | Предпочитает ли бригада нативную точку `sendLocation` вместо ссылки | §6.3 | Нет; один вызов |

Решения, требующие подтверждения владельца репозитория (не проверки, а выбора):
**отказ от библиотеки-фреймворка бота** в пользу шести вызовов `fetch` (§6.1) и
**Vitest как тестовый раннер** (§11).
