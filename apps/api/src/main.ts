import 'reflect-metadata'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  const config = app.get(ConfigService)
  app.enableCors({ origin: config.getOrThrow<string>('WEB_ORIGIN') })
  await app.listen(config.getOrThrow<number>('API_PORT'))
}

void bootstrap()
