import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { TEST_DATABASE_URL } from './database'

const run = promisify(execFile)

/** Миграции накатываются так же, как в проде, — `prisma migrate deploy`, а не
 *  `db push` (SRS §11.3). Тест, прошедший на схеме, собранной иначе, чем на сервере,
 *  не доказывает ничего о сервере.
 *
 *  Падение здесь намеренно валит весь прогон: молчаливый пропуск интеграционных тестов
 *  быстро превращается в «они никогда не запускались». */
export async function setup(): Promise<void> {
  await run('./node_modules/.bin/prisma', ['migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  })
}
