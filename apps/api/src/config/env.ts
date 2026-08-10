/** Валидация окружения на старте процесса.
 *
 * Проверяются только переменные, которые код действительно читает. `TELEGRAM_*` объявлены
 * в `.env.example`, но до среза 004 их никто не использует — требовать их сейчас значило бы
 * не пускать разработчика в приложение из-за незаполненного будущего.
 *
 * `S3_*` с этого среза обязательны: без хранилища заявка не принимается вовсе, и узнать
 * об этом лучше на старте процесса, чем на первой фотографии от жителя. */
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
  }

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
