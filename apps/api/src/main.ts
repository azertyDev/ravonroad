import 'reflect-metadata'
import { ConfigService } from '@nestjs/config'
import { logEvent } from './common/logger'
import { createApp } from './create-app'
import { ttlMs } from './stats/points-cache'

async function bootstrap(): Promise<void> {
  const app = await createApp()
  const config = app.get(ConfigService)
  // Числа, которые меняют поведение под нагрузкой, обязаны быть видны в том же потоке,
  // что и симптомы: при разборе инцидента контейнера уже не будет, а лог останется.
  // Секретов здесь нет и быть не может — только эти четыре значения.
  logEvent('info', 'config_loaded', {
    dbPool: config.getOrThrow<number>('DB_POOL'),
    intakeConcurrency: config.getOrThrow<number>('INTAKE_CONCURRENCY'),
    photoWorkers: config.getOrThrow<number>('PHOTO_WORKERS'),
    pointsCacheTtlMs: ttlMs(),
  })
  await app.listen(config.getOrThrow<number>('API_PORT'), '0.0.0.0')
}

void bootstrap()
