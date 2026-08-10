# 001 — Задачи

Формат: `T-XXX | задача | файлы | готово когда | размер | [P] | зависимости`.

- **Размер**: `S` ≤ ~80 строк диффа, `M` ≤ ~200, `L` ≤ ~300. Больше `L` — задача делится.
- **[P]** — задача не пересекается с другими по файлам и не ждёт их результата.
- **⚡** — задача критична для профиля нагрузки SRS §1.6 (всплеск до 1000 заявок в час).
  В этом срезе таких нет: принимать ещё нечего.
- **⚠** — задача требует решения владельца репозитория до старта (см. `spec.md`).
- **✅** — задача выполнена.

| ID | Задача | Файлы | Готово когда | Размер | [P] | Зависимости |
| --- | --- | --- | --- | --- | --- | --- |
| ✅ T-001 | Переименовать контракт статусов `Request*` → `Report*` (преамбула SRS) | `packages/shared-types/src/index.ts` | `grep -r REQUEST_STATUSES` даёт ноль совпадений; экспортируются `REPORT_STATUSES` и `ReportStatus`; `pnpm typecheck` зелёный | S | | — |
| ✅ T-002 | Объявить формат ответа об ошибке и union `ErrorCode` (SRS §8.1) | `packages/shared-types/src/errors.ts`, `src/index.ts` | тип `ApiErrorBody` экспортирован, `details` типизирован как допустимый только при `VALIDATION_FAILED`; `pnpm typecheck` зелёный | S | [P] | T-001 |
| ✅ T-003 | ⚠ Подключить тестовый раннер Vitest в workspace (SRS §11) | `package.json`, `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`, `packages/shared-types/vitest.config.ts` | `pnpm test` запускается из корня и проходит на одном тесте в каждом пакете | S | [P] | — |
| ✅ T-004 | Валидировать переменные окружения при старте `api`; поправить комментарий к `TELEGRAM_MODERATOR_IDS` по ADR-0005 | `apps/api/src/config/env.ts`, `apps/api/src/app.module.ts`, `.env.example` | без `DATABASE_URL` процесс не стартует и называет отсутствующую переменную; unit на функцию валидации зелёный | S | [P] | T-003 |
| ✅ T-005 | Prisma: клиент, `PrismaService`, первая миграция с `CREATE EXTENSION postgis` (SRS §2, §2.14) | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/0001_init/migration.sql`, `apps/api/src/prisma/*` | `prisma migrate deploy` на чистой БД проходит; `SELECT postgis_version()` возвращает строку | M | | T-004 |
| ✅ T-006 | `/health` и `/ready` (SRS §10.1) | `apps/api/src/health/*` | `/health` отвечает `200` всегда; при остановленном `db` `/ready` отвечает `503 {"db":"down"}`, а `/health` — `200`; интеграционный тест зелёный | S | | T-005 |
| ✅ T-007 | Middleware `X-Request-Id`: генерация и проброс в ответ (SRS §8.3, каркас) | `apps/api/src/common/request-id.middleware.ts` | каждый ответ несёт `X-Request-Id`; присланный клиентом идентификатор сохраняется; unit зелёный | S | [P] | T-004 |
| ✅ T-008 | `docker-compose` с `db`, `api`, `edge` и оверлеями лимитов (SRS §1.1, §12.1, §12.2) | `docker-compose.yml`, `docker-compose.prod.yml`, `docker-compose.dev.yml` | `docker compose up` на чистой машине даёт три контейнера в `running`; `curl -f localhost/api/health` → `200`; лимиты памяти совпадают с SRS §12 | M | | T-006 |
| ✅ T-009 | nginx `edge`: статика, proxy, SPA-fallback, заголовки безопасности, gzip/brotli (SRS §7.2, §9.8) | `docker/edge/nginx.conf`, `docker/edge/security-headers.conf` | `curl -I localhost/uz/z/whatever` → `200 text/html`; в заголовках есть `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Content-Security-Policy` | M | | T-008 |
| ✅ T-010 | Одноразовый контейнер миграций (SRS §12.2 п.2) | `docker-compose.yml`, `Dockerfile.migrate` | `docker compose run --rm migrate` накатывает миграции и завершается; постоянного контейнера под миграции нет | S | | T-008 |
| ✅ T-011 | `Dockerfile` для `api` и `web` + публикация образов в GHCR (SRS §12.2 п.1) | `Dockerfile.api`, `Dockerfile.web`, `.dockerignore`, `.github/workflows/build.yml` | push в `dev` публикует два образа в GHCR; `docker run` образа `api` отвечает на `/health` | M | | T-008 |
| ✅ T-012 | CI: lint, typecheck, test на каждый PR | `.github/workflows/ci.yml` | PR с ошибкой типизации даёт красную проверку; зелёный PR проходит все три шага | S | [P] | T-003 |
| ✅ T-013 | Дерево маршрутов с локалью в пути и редиректом с `/` (SRS §7.2, US-015) | `apps/web/src/router.tsx`, `apps/web/src/routes/$locale/*`, `apps/web/src/main.tsx` | `/` → `/uz/`; `/de/` → `/uz/`; `/ru/` открывается; `<html lang>` совпадает с сегментом локали | M | | T-001 |
| ✅ T-014 | Каркас i18n: словари `uz`/`ru`, хук перевода, переключатель языка (SRS §7.2, §8.2) | `apps/web/src/shared/i18n/*` | переключение языка сохраняет путь и все search-параметры; unit на равенство множеств ключей `uz` и `ru` зелёный (SRS §11.2) | M | | T-013 |
| ✅ T-015 | ⚠ Дизайн-токены и локальные шрифты Noto Sans + IBM Plex Mono | `apps/web/src/index.css`, `apps/web/public/fonts/*`, `apps/web/src/shared/ui/status/*` | во вкладке «Сеть» нет ни одного внешнего запроса за шрифтом; unit на маппинг «статус → форма» покрывает все 7 статусов (кольцо, ромб, штриховка, галочка, крест, два квадрата, косая черта) | M | | T-013 |
| ✅ T-016 | Форматирование чисел с разделителем разрядов U+00A0 | `apps/web/src/shared/format/number.ts` | unit: результат для 10000 содержит U+00A0 и не содержит U+2009 | S | [P] | T-013 |
| ✅ T-017 | Базовый layout: шапка с переключателем языка, подвал с контактом кампании, состояния загрузки/ошибки/пустоты | `apps/web/src/shared/ui/layout/*`, `apps/web/src/shared/ui/state/*` | на ширине 360 px нет горизонтального скролла; шапка и переключатель проходятся с клавиатуры, фокус виден на каждом шаге | M | | T-014, T-015 |
| ✅ T-018 | fetch-обёртка, разбор ошибки по SRS §8.1 и провайдер TanStack Query (SRS §7.5) | `apps/web/src/shared/api/*`, `apps/web/src/main.tsx` | ответ с телом ошибки разбирается в типизированный объект с `code` и `correlationId`; `refetchOnWindowFocus` выключен глобально; unit на разбор зелёный | S | | T-002, T-013 |
| ✅ T-019 | Гейт бюджета бандла в CI (PRD §8.1, SRS §7.7) | `scripts/bundle-budget.mjs`, `.github/workflows/ci.yml` | сборка печатает размер бандла и падает при превышении 700 КБ br; текущее значение видно в логе CI | S | | T-012, T-017 |
