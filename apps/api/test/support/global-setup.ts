import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'

const run = promisify(execFile)

/** Тот же образ, что в docker-compose: прогон на другой версии PostGIS не доказывал бы
 *  ничего о проде (SRS §11.3). */
const IMAGE = 'postgis/postgis:17-3.5'

let container: StartedPostgreSqlContainer

/** База поднимается на прогон и умирает вместе с ним. Общей базы нет намеренно: она
 *  либо оказывается чужой рабочей, либо копит мусор от упавших прогонов.
 *
 *  Миграции накатываются `prisma migrate deploy` — так же, как на сервере. */
export async function setup(): Promise<void> {
  try {
    container = await new PostgreSqlContainer(IMAGE).start()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`интеграционные тесты требуют Docker: ${reason}`, { cause: error })
  }

  const url = container.getConnectionUri()
  // Форки vitest наследуют окружение родителя при запуске, поэтому адрес контейнера
  // доходит до тестов через process.env, а не через отдельный канал.
  process.env['TEST_DATABASE_URL'] = url
  await run('./node_modules/.bin/prisma', ['migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url } })
}

export async function teardown(): Promise<void> {
  await container.stop()
}
