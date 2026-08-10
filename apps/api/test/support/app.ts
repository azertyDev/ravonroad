import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { createApp } from '../../src/create-app'
import { TEST_DATABASE_URL } from './database'

export interface TestApp {
  baseUrl: string
  close: () => Promise<void>
}

/** Поднимает то же приложение, что и `main.ts`, на случайном порту и ходит в него
 *  обычным `fetch`. Проверяются заголовки, коды и форма ответа — то есть граница,
 *  которую видит браузер, а не внутренние вызовы сервисов. */
export async function startTestApp(): Promise<TestApp> {
  // ConfigModule не перезаписывает уже заданные переменные значениями из .env,
  // поэтому база теста выигрывает у базы разработки.
  process.env['DATABASE_URL'] = TEST_DATABASE_URL
  const app: INestApplication = await createApp({ silent: true })
  await app.listen(0, '127.0.0.1')
  const baseUrl = await app.getUrl()
  return { baseUrl, close: () => app.close() }
}
