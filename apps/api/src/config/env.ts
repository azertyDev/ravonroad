/** Валидация окружения на старте процесса.
 *
 * Проверяются только переменные, которые код действительно читает.
 *
 * `S3_*` обязательны с 002: без хранилища заявка не принимается вовсе, и узнать об этом
 * лучше на старте процесса, чем на первой фотографии от жителя. `TELEGRAM_*` обязательны
 * с 004 по той же причине: без них модерация не работает, а карточки молча копятся
 * в очереди — отказ, который заметят через часы. */
export interface Env {
  DATABASE_URL: string
  WEB_ORIGIN: string
  API_PORT: number
  /** Одновременных запросов на приёме заявок. Восемь на проде, два на dev (SRS §12.2). */
  INTAKE_CONCURRENCY: number
  /** Воркеров обработки фотографий. Один даёт 5–8 фото/с при всплеске в 0,83 фото/с,
   *  но при задержке хранилища в 200 мс запас исчезает — тогда их становится два,
   *  и это одна переменная, а не правка кода (SRS §5.4). */
  PHOTO_WORKERS: number
  S3_ENDPOINT: string
  S3_REGION: string
  S3_BUCKET: string
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  S3_PUBLIC_BASE_URL: string
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
}

const DEFAULT_API_PORT = 3000
const MAX_PORT = 65535
const DEFAULT_INTAKE_CONCURRENCY = 8
const DEFAULT_PHOTO_WORKERS = 1

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
    API_PORT: DEFAULT_API_PORT,
    INTAKE_CONCURRENCY: DEFAULT_INTAKE_CONCURRENCY,
    PHOTO_WORKERS: DEFAULT_PHOTO_WORKERS,
    S3_ENDPOINT: requireString(source, 'S3_ENDPOINT', errors),
    S3_REGION: requireString(source, 'S3_REGION', errors),
    S3_BUCKET: requireString(source, 'S3_BUCKET', errors),
    S3_ACCESS_KEY_ID: requireString(source, 'S3_ACCESS_KEY_ID', errors),
    S3_SECRET_ACCESS_KEY: requireString(source, 'S3_SECRET_ACCESS_KEY', errors),
    S3_PUBLIC_BASE_URL: requireString(source, 'S3_PUBLIC_BASE_URL', errors),
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

  env.API_PORT = readInteger(source, 'API_PORT', 1, MAX_PORT, errors) ?? env.API_PORT
  env.INTAKE_CONCURRENCY =
    readInteger(source, 'INTAKE_CONCURRENCY', 1, 64, errors) ?? env.INTAKE_CONCURRENCY
  // Ноль воркеров — рабочая настройка, а не ошибка: так очередь останавливают,
  // не трогая приём заявок. Именно этим проверяется, что заявка принимается
  // и при остановленной обработке (AC-5).
  env.PHOTO_WORKERS = readInteger(source, 'PHOTO_WORKERS', 0, 8, errors) ?? env.PHOTO_WORKERS

  if (errors.length > 0) {
    throw new Error(`Invalid environment: ${errors.join('; ')}`)
  }
  return env
}
