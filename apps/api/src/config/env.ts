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
  S3_ENDPOINT: string
  S3_REGION: string
  S3_BUCKET: string
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  S3_PUBLIC_BASE_URL: string
}

const DEFAULT_API_PORT = 3000
const MAX_PORT = 65535

function requireString(source: Record<string, unknown>, name: string, errors: string[]): string {
  const value = source[name]
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  errors.push(`${name} is required`)
  return ''
}

export function validateEnv(source: Record<string, unknown>): Env {
  const errors: string[] = []
  const env: Env = {
    DATABASE_URL: requireString(source, 'DATABASE_URL', errors),
    WEB_ORIGIN: requireString(source, 'WEB_ORIGIN', errors),
    API_PORT: DEFAULT_API_PORT,
    S3_ENDPOINT: requireString(source, 'S3_ENDPOINT', errors),
    S3_REGION: requireString(source, 'S3_REGION', errors),
    S3_BUCKET: requireString(source, 'S3_BUCKET', errors),
    S3_ACCESS_KEY_ID: requireString(source, 'S3_ACCESS_KEY_ID', errors),
    S3_SECRET_ACCESS_KEY: requireString(source, 'S3_SECRET_ACCESS_KEY', errors),
    S3_PUBLIC_BASE_URL: requireString(source, 'S3_PUBLIC_BASE_URL', errors),
  }

  const rawPort = source['API_PORT']
  if (rawPort !== undefined && rawPort !== '') {
    const port = Number(rawPort)
    if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) {
      errors.push(`API_PORT must be an integer between 1 and ${MAX_PORT}`)
    } else {
      env.API_PORT = port
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment: ${errors.join('; ')}`)
  }
  return env
}
