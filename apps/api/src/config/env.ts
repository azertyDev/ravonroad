/** Валидация окружения на старте процесса.
 *
 * Проверяются только переменные, которые код действительно читает.
 *
 * `MEDIA_ROOT` обязателен с 002: без хранилища заявка не принимается вовсе, и узнать
 * об этом лучше на старте процесса, чем на первой фотографии от жителя. Проверяется здесь
 * только заданность пути; право записи в него — уже в `PhotoStorage.onModuleInit`,
 * потому что заданный, но чужой каталог ломает ровно так же (ADR-0009). `TELEGRAM_*` обязательны
 * с 004 по той же причине: без них модерация не работает, а карточки молча копятся
 * в очереди — отказ, который заметят через часы. */
export interface Env {
  DATABASE_URL: string
  WEB_ORIGIN: string
  /** Адрес публичного сайта. Из него собираются ссылки на страницу заявки — в карточке
   *  бота и в digest. Отдельно от `WEB_ORIGIN`, потому что тот отвечает за CORS: адрес
   *  `pnpm dev` (`localhost:5173`) в ссылке, которую откроет волонтёр с телефона,
   *  бесполезен. */
  PUBLIC_SITE_URL: string
  API_PORT: number
  /** Одновременных запросов на приёме заявок. Восемь на проде, два на dev (SRS §12.2). */
  INTAKE_CONCURRENCY: number
  /** Размер пула соединений Prisma. Восемь на проде, пять на dev: из 12 `max_connections`
   *  три зарезервированы под суперпользователя, и пул обязан оставить место миграциям
   *  и `psql` (SRS §12.2). */
  DB_POOL: number
  /** Воркеров обработки фотографий. Один даёт 5–8 фото/с при всплеске в 0,83 фото/с,
   *  но при задержке хранилища в 200 мс запас исчезает — тогда их становится два,
   *  и это одна переменная, а не правка кода (SRS §5.4). */
  PHOTO_WORKERS: number
  /** Каталог с фотографиями. Внутри контейнера это точка монтирования тома, а не путь
   *  внутри образа: образ пересоздаётся каждой выкаткой, снимки жителей — нет. */
  MEDIA_ROOT: string
  TELEGRAM_BOT_TOKEN: string
  /** Группа волонтёров. Одна на среду, идентификатор supergroup со знаком минус. */
  TELEGRAM_GROUP_CHAT_ID: string
  /** Значение заголовка `X-Telegram-Bot-Api-Secret-Token` (SRS §9.3). */
  TELEGRAM_WEBHOOK_SECRET: string
  /** Случайный сегмент пути webhook — второй эшелон обороны (SRS §9.3). Не задан —
   *  путь не проверяется: обязательная проверка здесь одна, и это secret-token. */
  TELEGRAM_WEBHOOK_PATH?: string
  /** Адрес Bot API. Подменяется заглушкой в интеграционных тестах и больше нигде. */
  TELEGRAM_API_BASE_URL?: string
  /** Источник **первичного** засева таблицы `moderator` (ADR-0005). После первого
   *  развёртывания состав меняется в БД, а не здесь. */
  TELEGRAM_MODERATOR_IDS?: string
  /** Приватный чат координатора для алертов (SRS §10.4). Необязателен намеренно: без него
   *  система работает, просто молча, — и на локальной машине это нормальное состояние. */
  TELEGRAM_ALERT_CHAT_ID?: string
}

const DEFAULT_API_PORT = 3000
const MAX_PORT = 65535
const DEFAULT_INTAKE_CONCURRENCY = 8
const DEFAULT_PHOTO_WORKERS = 1
const DEFAULT_DB_POOL = 8

function requireString(source: Record<string, unknown>, name: string, errors: string[]): string {
  const value = source[name]
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  errors.push(`${name} is required`)
  return ''
}

/** Необязательная переменная: пустая строка — это «не задана», а не «задана пустой».
 *  В `.env` пустое значение остаётся от закомментированного примера чаще, чем
 *  выставляется намеренно. */
function optionalString(source: Record<string, unknown>, name: string): string | undefined {
  const value = source[name]
  if (typeof value !== 'string' || value.trim() === '') return undefined
  return value.trim()
}

/** Возвращает `undefined`, если переменная не задана: тогда остаётся значение
 *  по умолчанию. Неверное значение — ошибка, а не молчаливый откат к умолчанию:
 *  опечатка в лимите не должна выглядеть как работающая настройка. */
function readInteger(
  source: Record<string, unknown>,
  name: string,
  minimum: number,
  maximum: number,
  errors: string[],
): number | undefined {
  const raw = source[name]
  if (raw === undefined || raw === '') return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    errors.push(`${name} must be an integer between ${minimum} and ${maximum}`)
    return undefined
  }
  return value
}

export function validateEnv(source: Record<string, unknown>): Env {
  const errors: string[] = []
  const env: Env = {
    DATABASE_URL: requireString(source, 'DATABASE_URL', errors),
    WEB_ORIGIN: requireString(source, 'WEB_ORIGIN', errors),
    PUBLIC_SITE_URL: requireString(source, 'PUBLIC_SITE_URL', errors),
    API_PORT: DEFAULT_API_PORT,
    INTAKE_CONCURRENCY: DEFAULT_INTAKE_CONCURRENCY,
    DB_POOL: DEFAULT_DB_POOL,
    PHOTO_WORKERS: DEFAULT_PHOTO_WORKERS,
    MEDIA_ROOT: requireString(source, 'MEDIA_ROOT', errors),
    TELEGRAM_BOT_TOKEN: requireString(source, 'TELEGRAM_BOT_TOKEN', errors),
    TELEGRAM_GROUP_CHAT_ID: requireString(source, 'TELEGRAM_GROUP_CHAT_ID', errors),
    TELEGRAM_WEBHOOK_SECRET: requireString(source, 'TELEGRAM_WEBHOOK_SECRET', errors),
  }

  const webhookPath = optionalString(source, 'TELEGRAM_WEBHOOK_PATH')
  if (webhookPath !== undefined) env.TELEGRAM_WEBHOOK_PATH = webhookPath
  const apiBaseUrl = optionalString(source, 'TELEGRAM_API_BASE_URL')
  if (apiBaseUrl !== undefined) env.TELEGRAM_API_BASE_URL = apiBaseUrl
  const moderatorIds = optionalString(source, 'TELEGRAM_MODERATOR_IDS')
  if (moderatorIds !== undefined) env.TELEGRAM_MODERATOR_IDS = moderatorIds
  const alertChatId = optionalString(source, 'TELEGRAM_ALERT_CHAT_ID')
  if (alertChatId !== undefined) env.TELEGRAM_ALERT_CHAT_ID = alertChatId

  env.API_PORT = readInteger(source, 'API_PORT', 1, MAX_PORT, errors) ?? env.API_PORT
  env.INTAKE_CONCURRENCY =
    readInteger(source, 'INTAKE_CONCURRENCY', 1, 64, errors) ?? env.INTAKE_CONCURRENCY
  // Верхняя граница — `max_connections` прода: пул больше него невыполним by construction.
  env.DB_POOL = readInteger(source, 'DB_POOL', 1, 20, errors) ?? env.DB_POOL
  // Ноль воркеров — рабочая настройка, а не ошибка: так очередь останавливают,
  // не трогая приём заявок. Именно этим проверяется, что заявка принимается
  // и при остановленной обработке (AC-5).
  env.PHOTO_WORKERS = readInteger(source, 'PHOTO_WORKERS', 0, 8, errors) ?? env.PHOTO_WORKERS

  if (errors.length > 0) {
    throw new Error(`Invalid environment: ${errors.join('; ')}`)
  }
  return env
}
