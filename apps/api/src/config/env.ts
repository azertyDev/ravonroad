/** Валидация окружения на старте процесса.
 *
 * Проверяются только переменные, которые код действительно читает. `S3_*` и `TELEGRAM_*`
 * объявлены в `.env.example`, но их никто не использует до срезов 002 и 004 — требовать
 * их сейчас значило бы не пускать разработчика в приложение из-за незаполненного будущего. */
export interface Env {
  DATABASE_URL: string
  WEB_ORIGIN: string
  API_PORT: number
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
