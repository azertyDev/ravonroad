import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { INestApplication } from '@nestjs/common'
import { AppModule } from './app.module'
import { ApiExceptionFilter } from './common/api-exception.filter'
import { requestIdMiddleware } from './common/request-id.middleware'

/** Сборка приложения живёт отдельно от точки входа, потому что у неё два вызывающих:
 *  `main.ts` в контейнере и интеграционные тесты. Собранное иначе приложение
 *  проверяло бы не то, что запускается на сервере. */
export async function createApp(options: { silent?: boolean } = {}): Promise<INestApplication> {
  // Тесты поднимают приложение десятки раз за прогон, и стартовый баннер Nest прячет
  // в выводе то, ради чего прогон и запускался.
  const app = await NestFactory.create(AppModule, options.silent === true ? { logger: false } : {})
  const config = app.get(ConfigService)
  // Единый префикс: наружу edge отдаёт /api/*, внутрь проксирует как есть (SRS §4.1).
  // Проверки живости из него исключены: их адреса — /health и /ready (SRS §4.1, §10.4),
  // по ним настраивается внешний пинг аптайма, и он не должен зависеть от префикса.
  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] })
  app.use(requestIdMiddleware)
  // Одна форма тела ошибки на весь API, включая исключения самого Nest (SRS §8.1).
  app.useGlobalFilters(new ApiExceptionFilter())
  app.enableCors({ origin: config.getOrThrow<string>('WEB_ORIGIN') })
  return app
}
