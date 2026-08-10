import 'reflect-metadata'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { requestIdMiddleware } from './common/request-id.middleware'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)
  // Единый префикс: наружу edge отдаёт /api/*, внутрь проксирует как есть (SRS §4.1).
  // Проверки живости из него исключены: их адреса — /health и /ready (SRS §4.1, §10.4),
  // по ним настраивается внешний пинг аптайма, и он не должен зависеть от префикса.
  app.setGlobalPrefix('api', { exclude: ['health', 'ready'] })
  app.use(requestIdMiddleware)
  app.enableCors({ origin: config.getOrThrow<string>('WEB_ORIGIN') })
  await app.listen(config.getOrThrow<number>('API_PORT'), '0.0.0.0')
}

void bootstrap()
