# Бэклог MVP RavonRoad

Сводная таблица всех задач шести вертикальных срезов. Источник истины по каждой
задаче — `specs/NNN-slug/tasks.md`; здесь тот же набор одним списком, с ветками
и срезами. Расхождение этого файла с `tasks.md` — ошибка этого файла.

- Всего задач: **108**. По срезам: `001` Каркас — 19, `002` Подача заявки — 25, `003` Публичная карта — 19, `004` Telegram-бот — 23, `005` Локали и доступность — 11, `006` Наблюдаемость — 11.
- Размер: `S` ≤ ~80 строк диффа, `M` ≤ ~200, `L` ≤ ~300. Одна задача — один PR.
- `[P]` — задача не пересекается с другими по файлам и не ждёт их результата.
- ⚡ — критично для профиля нагрузки: всплеск до 1000 заявок в час (SRS §1.6).
- ⚠ — заблокирована решением владельца репозитория или продакта (см. `spec.md` среза).
- Ветка создаётся от `dev` **до первого коммита**: `git checkout -b <ветка> dev` (`CLAUDE.md`).

## Порядок срезов

Срезы упорядочены так, чтобы после каждого приложение оставалось запускаемым.

| Срез | Что появляется | Состояние после среза |
| --- | --- | --- |
| `001-foundation` | Каркас, локали в пути, дизайн-токены, `/health`, `/ready`, образы в GHCR | Сайт открывается и деплоится; заявок ещё нет |
| `002-report-submission` | Форма, приём, гео, геозабор, очередь фото, токен, номер | Заявку можно отправить; смотреть её негде |
| `003-public-map` | Карта, список, фильтры, карточка, счётчик, `/z/<token>` | Заявки видны публично; статусы никто не меняет |
| `004-telegram-bot` | Webhook, allowlist, карточка в группу, переходы, отмена, фото «после» | **Петля замкнута**: счётчик растёт от реальной работы |
| `005-i18n-a11y` | Полные локали `uz`/`ru`, WCAG 2.2 AA | Продуктом можно пользоваться на своём языке и своим вводом |
| `006-observability` | Логи, correlation id, глубины очередей, алерты, бэкапы | О поломке узнают раньше жителя; можно анонсировать |

## Все задачи

| ID | Задача | Срез | Ветка | Размер | [P] | Зависимости |
| --- | --- | --- | --- | --- | --- | --- |
| T-001 | Переименовать контракт статусов `Request*` → `Report*` (преамбула SRS) | `001-foundation` | `feat/001-report-status-rename` | S |  | — |
| T-002 | Объявить формат ответа об ошибке и union `ErrorCode` (SRS §8.1) | `001-foundation` | `feat/001-error-contract` | S | [P] | T-001 |
| T-003 | ⚠ Подключить тестовый раннер Vitest в workspace (SRS §11) | `001-foundation` | `feat/001-vitest-setup` | S | [P] | — |
| T-004 | Валидировать переменные окружения при старте `api`; поправить комментарий к `TELEGRAM_MODERATOR_IDS` по ADR-0005 | `001-foundation` | `feat/001-env-validation` | S | [P] | T-003 |
| T-005 | Prisma: клиент, `PrismaService`, первая миграция с `CREATE EXTENSION postgis` (SRS §2, §2.14) | `001-foundation` | `feat/001-prisma-postgis-init` | M |  | T-004 |
| T-006 | `/health` и `/ready` (SRS §10.1) | `001-foundation` | `feat/001-health-ready` | S |  | T-005 |
| T-007 | Middleware `X-Request-Id`: генерация и проброс в ответ (SRS §8.3, каркас) | `001-foundation` | `feat/001-request-id` | S | [P] | T-004 |
| T-008 | `docker-compose` с `db`, `api`, `edge` и оверлеями лимитов (SRS §1.1, §12.1, §12.2) | `001-foundation` | `feat/001-docker-compose` | M |  | T-006 |
| T-009 | nginx `edge`: статика, proxy, SPA-fallback, заголовки безопасности, gzip/brotli (SRS §7.2, §9.8) | `001-foundation` | `feat/001-edge-nginx` | M |  | T-008 |
| T-010 | Одноразовый контейнер миграций (SRS §12.2 п.2) | `001-foundation` | `feat/001-migrate-container` | S |  | T-008 |
| T-011 | `Dockerfile` для `api` и `web` + публикация образов в GHCR (SRS §12.2 п.1) | `001-foundation` | `feat/001-images-ghcr` | M |  | T-008 |
| T-012 | CI: lint, typecheck, test на каждый PR | `001-foundation` | `feat/001-ci-checks` | S | [P] | T-003 |
| T-013 | Дерево маршрутов с локалью в пути и редиректом с `/` (SRS §7.2, US-015) | `001-foundation` | `feat/001-locale-routing` | M |  | T-001 |
| T-014 | Каркас i18n: словари `uz`/`ru`, хук перевода, переключатель языка (SRS §7.2, §8.2) | `001-foundation` | `feat/001-i18n-scaffold` | M |  | T-013 |
| T-015 | ⚠ Дизайн-токены и локальные шрифты Noto Sans + IBM Plex Mono | `001-foundation` | `feat/001-design-tokens` | M |  | T-013 |
| T-016 | Форматирование чисел с разделителем разрядов U+00A0 | `001-foundation` | `feat/001-number-format` | S | [P] | T-013 |
| T-017 | Базовый layout: шапка с переключателем языка, подвал с контактом кампании, состояния загрузки/ошибки/пустоты | `001-foundation` | `feat/001-base-layout` | M |  | T-014, T-015 |
| T-018 | fetch-обёртка, разбор ошибки по SRS §8.1 и провайдер TanStack Query (SRS §7.5) | `001-foundation` | `feat/001-api-client-query` | S |  | T-002, T-013 |
| T-019 | Гейт бюджета бандла в CI (PRD §8.1, SRS §7.7) | `001-foundation` | `feat/001-bundle-budget` | S |  | T-012, T-017 |
| T-020 | Объявить контракт создания заявки и справочников (SRS §4.2, §4.6, ADR-0006) | `002-report-submission` | `feat/002-report-contract` | S |  | T-002 |
| T-021 | Миграция `district` + `category`, GiST-индекс, сид из GeoJSON и глоссария (SRS §2.5, §2.6) | `002-report-submission` | `feat/002-district-category-seed` | M |  | T-005 |
| T-022 | Миграция `report`: последовательность номера, индексы, CHECK-инварианты (SRS §2.1, §2.2) | `002-report-submission` | `feat/002-report-table` | M |  | T-021 |
| T-023 | Миграция `report_photo`, `abuse_signal`, `form_open_counter` (SRS §2.4, §2.9, §2.13) | `002-report-submission` | `feat/002-photo-abuse-tables` | M |  | T-022 |
| T-024 | Миграция `report_status_history` (SRS §2.7) | `002-report-submission` | `feat/002-status-history-table` | S |  | T-022 |
| T-025 | Гео-модуль: point-in-polygon и геозабор одним `$queryRaw` (SRS §3.3, §2.14) | `002-report-submission` | `feat/002-point-in-polygon` | M |  | T-021 |
| T-026 | Поиск вероятных дублей в 50 м и запись `duplicate_candidate_of_id` (SRS §3.2) | `002-report-submission` | `feat/002-duplicate-search` | M |  | T-025, T-022 |
| T-027 | `GET /api/districts` и `GET /api/categories` (SRS §4.6) | `002-report-submission` | `feat/002-catalog-endpoints` | S |  | T-021, T-020 |
| T-028 | ⚠ S3-клиент: PUT, GET, DELETE, HEAD; схема ключей (SRS §5.5) | `002-report-submission` | `feat/002-s3-client` | M |  | T-004 |
| T-029 | ⚡ Приём multipart: лимиты на потоке, magic bytes, семафор 8 (SRS §4.2, §5.3, §5.7) | `002-report-submission` | `feat/002-multipart-intake` | M |  | T-028 |
| T-030 | ⚡ Лимиты запросов в памяти процесса, скользящее окно (SRS §9.5) | `002-report-submission` | `feat/002-rate-limit` | S | [P] | T-004 |
| T-031 | Генерация `tracking_token` (SRS §2.3) | `002-report-submission` | `feat/002-tracking-token` | S | [P] | T-022 |
| T-032 | ⚡ `POST /api/reports`: геозабор до файлов, PUT сырых байт, одна транзакция, `201` (SRS §1.3, §4.2, §5.3) | `002-report-submission` | `feat/002-create-report` | L |  | T-023, T-024, T-025, T-029, T-031 |
| T-033 | Идемпотентность по `Idempotency-Key` (SRS §4.2) | `002-report-submission` | `feat/002-idempotency` | S |  | T-032 |
| T-034 | ⚡ Сигналы антиабуза: honeypot, скорость заполнения, мягкий лимит по IP (PRD §10.2–10.4, SRS §2.9) | `002-report-submission` | `feat/002-abuse-signals` | M |  | T-032, T-023 |
| T-035 | ⚡ Photo-воркер: очередь на `report_photo`, `FOR UPDATE SKIP LOCKED`, backoff, `FAILED` (SRS §5.4, ADR-0007) | `002-report-submission` | `feat/002-photo-worker` | L |  | T-032, T-028 |
| T-036 | ⚠⚡ Перекодирование: `sharp`, вырезание EXIF, ориентация, превью 400 px, `sha256` по итоговым байтам (SRS §5.3 п.4–5, §5.5, §9.6) | `002-report-submission` | `feat/002-photo-processing` | M |  | T-035 |
| T-037 | `POST /api/form-opens` — суточный счётчик для метрики P-1 (SRS §2.13, §4.6) | `002-report-submission` | `feat/002-form-opens` | S | [P] | T-023, T-030 |
| T-038 | ⚠ Загрузчик Яндекс JS API v3 и виджет выбора точки (SRS §7.4, ADR-0004) | `002-report-submission` | `feat/002-map-pin-widget` | M |  | T-018 |
| T-039 | Доступная альтернатива пину: «моё местоположение» и поля широты/долготы (US-007, PRD §8.2) | `002-report-submission` | `feat/002-pin-a11y-alternative` | M |  | T-038 |
| T-040 | ⚡ Клиентский даунскейл фото до 1600 px и конвертация в JPEG (SRS §5.2) | `002-report-submission` | `feat/002-client-downscale` | M |  | T-018 |
| T-041 | Форма заявки: поля, валидация, honeypot, счётчик символов, предпросмотр (US-006, 008–011, 017) | `002-report-submission` | `feat/002-report-form` | L |  | T-040, T-039, T-027, T-020 |
| T-042 | ⚡ Черновик в IndexedDB и `Idempotency-Key` (US-016, SRS §7.6) | `002-report-submission` | `feat/002-form-draft` | M |  | T-041, T-033 |
| T-043 | Экран подтверждения: номер, ссылка `/z/<token>`, предупреждение, ожидание превью (US-012, SRS §7.5) | `002-report-submission` | `feat/002-confirmation-screen` | M |  | T-042 |
| T-044 | ⚡ Интеграционные тесты приёма: гонка номеров, транзакционность, приватность ответа (SRS §11.3) | `002-report-submission` | `feat/002-intake-integration-tests` | M |  | T-032, T-034, T-035 |
| T-045 | Объявить контракт публичного чтения (SRS §4.3–§4.5, ADR-0006) | `003-public-map` | `feat/003-public-read-contract` | S |  | T-020 |
| T-046 | ⚡ `GET /api/reports/map` и кэш всех публичных точек в памяти под single-flight (SRS §4.4, §4.7) | `003-public-map` | `feat/003-map-endpoint-cache` | M |  | T-045, T-022 |
| T-047 | ⚡ Микрокэш nginx на карту, счётчик и справочники (SRS §4.7) | `003-public-map` | `feat/003-nginx-microcache` | S |  | T-009, T-046 |
| T-048 | `GET /api/reports`: фильтры и keyset-курсор (SRS §4.3) | `003-public-map` | `feat/003-reports-list-cursor` | M |  | T-045 |
| T-049 | `GET /api/reports/:number` — публичная карточка (SRS §4.4, §2.7) | `003-public-map` | `feat/003-report-detail-endpoint` | S |  | T-045, T-024 |
| T-050 | `GET /api/stats` — счётчик из данных (SRS §4.6, PRD 5.3.2) | `003-public-map` | `feat/003-stats-endpoint` | S |  | T-046 |
| T-051 | `GET /api/track/:token` и `DELETE /api/track/:token/contacts` (SRS §4.5, §9.2) | `003-public-map` | `feat/003-track-endpoints` | M |  | T-031, T-030, T-045 |
| T-052 | Тест на форму каждого публичного ответа (SRS §11.3, PRD §6.2) | `003-public-map` | `feat/003-privacy-response-test` | S | [P] | T-048, T-049, T-050, T-051 |
| T-053 | ⚠⚡ Карта на главной: тайлы, маркеры, кластеризация `YMapClusterer` (SRS §3.4, §7.4) | `003-public-map` | `feat/003-public-map` | L |  | T-046, T-038 |
| T-054 | Кнопка «моё местоположение» на публичной карте (US-002) | `003-public-map` | `feat/003-map-locate-button` | S |  | T-053 |
| T-055 | Фильтры в search-параметрах с `validateSearch` (SRS §7.3, US-003) | `003-public-map` | `feat/003-filters-search-params` | M |  | T-048, T-053 |
| T-056 | Список заявок с подгрузкой по курсору и счётчиком по району (US-031, US-033) | `003-public-map` | `feat/003-reports-list-view` | M |  | T-055 |
| T-057 | Карточка заявки (US-004) | `003-public-map` | `feat/003-report-detail-page` | M |  | T-049 |
| T-058 | Счётчик кампании на главной (US-005) | `003-public-map` | `feat/003-campaign-counter` | S | [P] | T-050, T-016 |
| T-059 | Страница `/z/<token>` (US-013) | `003-public-map` | `feat/003-track-page` | M |  | T-051 |
| T-060 | Кнопка удаления контактов на `/z/<token>` (US-014) | `003-public-map` | `feat/003-contacts-delete-button` | S |  | T-059 |
| T-061 | Маркеры семи статусов на карте: отдельный `DONE` и маркер реестра `OUT_OF_SCOPE` (PRD §6.1, US-032) | `003-public-map` | `feat/003-status-markers` | S |  | T-053, T-015 |
| T-062 | Пустое состояние, ошибка и отсутствие сети на карте и в списке (PRD §8.4) | `003-public-map` | `feat/003-empty-error-offline` | S |  | T-055 |
| T-063 | ⚠ E2E: три сценария SRS §11.4 | `003-public-map` | `feat/003-e2e-scenarios` | M |  | T-060, T-043 |
| T-064 | Миграции `moderator`, `telegram_outbox`, `processed_update`, `bot_prompt`, `moderation_batch` (SRS §2.8, §2.10–§2.12, §2.15) | `004-telegram-bot` | `feat/004-telegram-tables` | M |  | T-022, T-024 |
| T-065 | Сверить и добить колонки `report` под переходы: `telegram_*_message_id`, `duplicate_of_id`, `status_reason*`, `publication_url`, `done_at` (SRS §2.2) | `004-telegram-bot` | `feat/004-report-transition-columns` | S |  | T-064 |
| T-066 | Первичный засев `moderator` из `TELEGRAM_MODERATOR_IDS` и документированный сниппет правки состава (ADR-0005, SRS §2.8) | `004-telegram-bot` | `feat/004-moderator-seed` | S |  | T-064 |
| T-067 | Webhook-контроллер и проверка `X-Telegram-Bot-Api-Secret-Token` (SRS §6.2, §9.3) | `004-telegram-bot` | `feat/004-webhook-secret` | M |  | T-064 |
| T-068 | Идемпотентность апдейтов по `update_id` и осмысленные коды ответа (SRS §6.11) | `004-telegram-bot` | `feat/004-update-idempotency` | S |  | T-067 |
| T-069 | Кодек `callback_data` с версией схемы (SRS §6.4) | `004-telegram-bot` | `feat/004-callback-data-codec` | S | [P] | T-067 |
| T-070 | Сверка нажавшего с allowlist **до любой записи** (US-024, SRS §6.2, §9.4) | `004-telegram-bot` | `feat/004-allowlist-guard` | M |  | T-067, T-066 |
| T-071 | Машина переходов по таблице PRD §5.1 | `004-telegram-bot` | `feat/004-transition-machine` | M |  | T-022 |
| T-072 | ⚡ Outbox-воркер: `SKIP LOCKED`, backoff, обработка `429`, бюджет 20 сообщений/мин (SRS §6.7) | `004-telegram-bot` | `feat/004-outbox-worker` | L |  | T-064 |
| T-073 | ⚡ Рендер карточки: медиагруппа с подписью + сообщение с кнопками (SRS §6.3, §6.4) | `004-telegram-bot` | `feat/004-card-renderer` | M |  | T-072, T-069, T-034, T-026 |
| T-074 | ⚡ Постановка `CARD_CREATE` после обработки последнего `BEFORE`-фото (SRS §1.3 п.7) | `004-telegram-bot` | `feat/004-card-create-enqueue` | S |  | T-073, T-036 |
| T-075 | Одношаговые переходы: «Принять», «В работу», «Вернуть в очередь» (US-019, US-023) | `004-telegram-bot` | `feat/004-one-tap-transitions` | M |  | T-071, T-070 |
| T-076 | Гонка двух модераторов через условный `UPDATE` (US-026, SRS §6.6) | `004-telegram-bot` | `feat/004-transition-race` | S |  | T-075 |
| T-077 | Обновление карточки после перехода и схлопывание неотправленных `CARD_EDIT` (US-026, SRS §6.6) | `004-telegram-bot` | `feat/004-card-update` | S |  | T-075 |
| T-078 | Двухшаговые переходы с причиной из списка: `REJECTED`, `OUT_OF_SCOPE` (US-020, US-022, SRS §6.5) | `004-telegram-bot` | `feat/004-reason-transitions` | M |  | T-075 |
| T-079 | Текстовый ввод через `ForceReply`: «другое» и номер оригинала (US-021, SRS §6.5, §2.12) | `004-telegram-bot` | `feat/004-force-reply-prompts` | M |  | T-078 |
| T-080 | Окно отмены 15 минут и отложенное снятие кнопки (PRD §5.4, SRS §6.10) | `004-telegram-bot` | `feat/004-undo-window` | L |  | T-077, T-024 |
| T-081 | ⚡ Приём фото «после» ответом на карточку, буфер альбома 2 с (US-028, US-030, SRS §6.8) | `004-telegram-bot` | `feat/004-after-photos` | L |  | T-072, T-036, T-071 |
| T-082 | Инвариант BR-006 в транзакции перехода в `DONE` (SRS §2.2, §11.3) | `004-telegram-bot` | `feat/004-done-invariant` | S |  | T-081 |
| T-083 | Ссылка на публикацию (US-029, SRS §6.9) | `004-telegram-bot` | `feat/004-publication-url` | S |  | T-081 |
| T-084 | ⚡ Digest-режим при очереди больше 30 заявок (SRS §6.13, §2.15) | `004-telegram-bot` | `feat/004-digest-mode` | L |  | T-072, T-064 |
| T-085 | ⚡ Пакетные действия и их отмена (SRS §6.14) | `004-telegram-bot` | `feat/004-batch-actions` | L |  | T-084, T-080 |
| T-086 | ⚡ Кластеры дублей: одна карточка на кластер и приоритет очереди (SRS §6.14, §3.2) | `004-telegram-bot` | `feat/004-duplicate-clusters` | M |  | T-085, T-026 |
| T-087 | ⚠ Полные словари интерфейса `uz` и `ru` по всем экранам | `005-i18n-a11y` | `feat/005-full-dictionaries` | M |  | T-014, T-059, T-041 |
| T-088 | Локализация доменных кодов: статусы, причины `REJECTED` и `OUT_OF_SCOPE`, признак отмены (US-015, SRS §8.2) | `005-i18n-a11y` | `feat/005-domain-code-labels` | M |  | T-087 |
| T-089 | Названия районов из глоссария и GeoJSON (US-015) | `005-i18n-a11y` | `feat/005-district-labels` | S | [P] | T-087 |
| T-090 | Категории из БД в двух локалях, без дублирования в словарях (SRS §2.5) | `005-i18n-a11y` | `feat/005-category-labels` | S |  | T-027, T-087 |
| T-091 | Свободный текст модератора не переводится и помечен (SRS §8.2) | `005-i18n-a11y` | `feat/005-moderator-free-text` | S | [P] | T-088 |
| T-092 | ⚠ Контраст палитры и размер целей 24×24 (PRD §8.2) | `005-i18n-a11y` | `feat/005-contrast-target-size` | M |  | T-015 |
| T-093 | Клавиатурная проходимость формы, фильтров и карты (PRD §8.2, US-007) | `005-i18n-a11y` | `feat/005-keyboard-navigation` | M |  | T-041, T-055 |
| T-094 | Подписи полей и программная связь ошибок с полями (PRD §8.2, US-006) | `005-i18n-a11y` | `feat/005-field-labels-errors` | M |  | T-093 |
| T-095 | Подписи статусов и различимость в монохроме (PRD §8.2) | `005-i18n-a11y` | `feat/005-status-monochrome` | S |  | T-015, T-061, T-088 |
| T-096 | ⚠ Сообщение о неподдерживаемом браузере (PRD §8.5) | `005-i18n-a11y` | `feat/005-unsupported-browser` | S | [P] | T-017 |
| T-097 | ⚠ Проверка на реальном iPhone: HEIC и Safari iOS (PRD §8.5, SRS §16 п.3) | `005-i18n-a11y` | `feat/005-ios-heic-check` | M |  | T-040, T-043 |
| T-098 | Correlation id через `AsyncLocalStorage` (SRS §8.3) | `006-observability` | `feat/006-correlation-id` | M |  | T-007 |
| T-099 | Структурные логи JSON в stdout и запретный список полей (SRS §8.4) | `006-observability` | `feat/006-structured-logs` | M |  | T-098 |
| T-100 | Довести до лога 12 обязательных событий (SRS §10.2) | `006-observability` | `feat/006-required-log-events` | M |  | T-099 |
| T-101 | `/health/details` с кэшем внешних проверок на 60 с (SRS §10.1) | `006-observability` | `feat/006-health-details` | M |  | T-006, T-028, T-072 |
| T-102 | ⚡ Событие `queue_depth` в проходах обоих воркеров (SRS §10.3) | `006-observability` | `feat/006-queue-depth-metric` | S |  | T-035, T-072, T-099 |
| T-103 | ⚡⚠ Алерты в приватный чат координатора с дедупликацией (SRS §10.4) | `006-observability` | `feat/006-alerts-channel` | L |  | T-102, T-072 |
| T-104 | Активная проверка `getWebhookInfo` каждые 5 минут (SRS §10.4) | `006-observability` | `feat/006-webhook-health-check` | M |  | T-103 |
| T-105 | `docs/metrics.sql` — метрики P-1…P-6 и North Star (SRS §10.3, PRD §1.3) | `006-observability` | `feat/006-metrics-sql` | S | [P] | T-022, T-024, T-037 |
| T-106 | Суточная задача очистки: IP 30 дней, контакты 90 дней, `processed_update` 7 дней, просроченные `bot_prompt` (SRS §9.8, §2.11, §2.12, PRD §9.2.5) | `006-observability` | `feat/006-cleanup-job` | M |  | T-064, T-022 |
| T-107 | ⚠ Резервные копии `pg_dump` в S3, 14 копий (SRS §10.5) | `006-observability` | `feat/006-db-backups` | M |  | T-011, T-028 |
| T-108 | ⚡ Нагрузочная проверка порогов PRD §8.1 на сиде из 5000 заявок (SRS §11.5) | `006-observability` | `feat/006-load-baseline` | M |  | T-053, T-107 |

## Покрытие US из PRD

Все 33 истории PRD §3 покрыты хотя бы одной задачей. **Непокрытых US нет.**

| US | Название | Задачи |
| --- | --- | --- |
| US-001 | Карта заявок | T-046, T-053, T-061 |
| US-002 | Своя геопозиция | T-039, T-054 |
| US-003 | Фильтры с состоянием в URL | T-048, T-055 |
| US-004 | Карточка заявки | T-049, T-052, T-057 |
| US-005 | Публичный счётчик | T-050, T-058 |
| US-006 | Отправка без регистрации | T-032, T-041, T-094 |
| US-007 | Координаты пином | T-025, T-038, T-039 |
| US-008 | Фото «до» | T-029, T-040, T-041 |
| US-009 | Ориентир | T-041, T-073 |
| US-010 | Категория | T-021, T-027, T-041, T-090 |
| US-011 | Необязательный контакт | T-041, T-052 |
| US-012 | Ссылка отслеживания | T-031, T-043 |
| US-013 | Страница отслеживания | T-051, T-059 |
| US-014 | Удаление контактов | T-051, T-060 |
| US-015 | Локали | T-013, T-014, T-087, T-088, T-089 |
| US-016 | Потеря сети при заполнении | T-033, T-042, T-062 |
| US-017 | Геозабор | T-025, T-032, T-041 |
| US-018 | Карточка новой заявки в группе | T-072, T-073, T-074 |
| US-019 | Принять заявку | T-075 |
| US-020 | Отклонить с причиной | T-078, T-079 |
| US-021 | Пометить дубль | T-079, T-086 |
| US-022 | Пометить как не по силам | T-078 |
| US-023 | Взять в работу | T-075 |
| US-024 | Кнопки только для allowlist | T-066, T-070 |
| US-025 | Видимость флага антиабуза | T-034, T-073 |
| US-026 | Актуальность карточки | T-076, T-077 |
| US-027 | Навигация по координатам | T-073 |
| US-028 | Фото «после» закрывает заявку | T-081, T-082 |
| US-029 | Ссылка на публикацию | T-083 |
| US-030 | Понятный отказ | T-081 |
| US-031 | Очередь по районам | T-055, T-056 |
| US-032 | Публичный реестр OUT_OF_SCOPE | T-048, T-061 |
| US-033 | Выборка DONE за период | T-048, T-055 |

### Бизнес-требования BRD вне покрытия

| BR | Почему нет задачи |
| --- | --- |
| BR-014 (отчёт спонсору за период) | Покрыт **частично** и сознательно: срез в интерфейсе даёт US-033 (T-048, T-055), машинная выгрузка вынесена в v1.1 (PRD §3.6, §11.2) |
| BR-016 (перенос модели на другой город) | Вне рамки MVP, вынесен в v2 (PRD §3.6, §11.3) |

## Критический путь

**До первого работающего деплоя** — весь срез `001` (19 задач). Длиннейшая цепочка
зависимостей внутри него — шесть звеньев:

```
T-003 → T-004 → T-005 → T-006 → T-008 → T-011
vitest  env    prisma  health compose образы в GHCR
```

Параллельно ей идёт цепочка фронта `T-001 → T-013 → T-014 → T-017 → T-019`
и одиночные `T-007`, `T-012`. Деплою нужны обе плюс `T-009` (nginx) и `T-010`
(контейнер миграций).

**До замкнутой петли** (заявка с сайта → карточка в группе → фото «после» →
счётчик) — 44 задачи из четырёх срезов: 8 из `001`, 22 из `002`, 5 из `003`,
9 из `004`. Длиннейшая цепочка — одиннадцать звеньев:

```
T-003 → T-004 → T-005 → T-021 → T-022 → T-023 → T-032 → T-035 → T-036 → T-081 → T-082
vitest  env    prisma  районы  report  фото    приём   photo-  ресайз  фото    инвариант
                              +катего- +abuse  заявки  воркер  +EXIF   «после» BR-006
                               рии
```

Вторая цепочка той же длины ведёт к карточке в группе:

```
T-003 → T-004 → T-005 → T-021 → T-022 → T-024 → T-064 → T-067 → T-069 → T-073 → T-074
```

Четыре задачи на этом пути заблокированы чужими решениями: `T-003` (тестовый
раннер), `T-028` (S3-клиент), `T-038` (условия Яндекс JS API), `T-053`
(`YMapClusterer`). Их разблокировка — работа нулевого дня, а не первого.

**До анонса на 127 000 подписчиков** обязателен `006`: без глубин очередей
и алертов первый всплеск обнаружится по сообщению в группе «а где мои фотки»
(SRS §10.4, §12.3).
