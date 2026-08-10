import 'reflect-metadata'
import type { INestApplication } from '@nestjs/common'
import { TEST_DATABASE_URL } from './database'
import { applyStorageEnv, startFakeStorage, type FakeStorage } from './storage'

export interface TestApp {
  baseUrl: string
  storage: FakeStorage
  close: () => Promise<void>
}

/** Поднимает то же приложение, что и `main.ts`, на случайном порту и ходит в него
 *  обычным `fetch`. Проверяются заголовки, коды и форма ответа — то есть граница,
 *  которую видит браузер, а не внутренние вызовы сервисов.
 *
 *  `create-app` подключается динамически, и это не стилистика: `ConfigModule.forRoot`
 *  читает и проверяет окружение в момент **импорта** модуля, а не при сборке приложения.
 *  Статический импорт выполнился бы раньше `beforeAll`, и приложение получило бы адрес
 *  хранилища, которого ещё нет. */
export async function startTestApp(): Promise<TestApp> {
  const storage = await startFakeStorage()
  applyStorageEnv(storage)
  process.env['DATABASE_URL'] = TEST_DATABASE_URL
  process.env['WEB_ORIGIN'] ??= 'http://localhost:5173'

  const { createApp } = await import('../../src/create-app')
  const app: INestApplication = await createApp({ silent: true })
  await app.listen(0, '127.0.0.1')

  return {
    baseUrl: await app.getUrl(),
    storage,
    close: async () => {
      await app.close()
      await storage.close()
    },
  }
}
