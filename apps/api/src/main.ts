import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule)
  app.enableCors({ origin: process.env['WEB_ORIGIN'] ?? true })
  await app.listen(Number(process.env['API_PORT'] ?? 3000))
}

void bootstrap()
