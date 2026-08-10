import { resolve } from 'node:path'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { validateEnv } from './config/env'
import { HealthModule } from './health/health.module'
import { PrismaModule } from './prisma/prisma.module'

// .env лежит в корне монорепозитория, а процесс запускается из apps/api — и `nest start`,
// и `node dist/main.js`. Без явного пути ConfigModule искал бы файл в apps/api, не находил
// и падал на валидации. Тот же расчёт, что в prisma.config.ts: в контейнере файла нет,
// отсутствующий путь ConfigModule молча пропускает, а переменные приходят из окружения.
const ROOT_ENV_FILE = resolve(process.cwd(), '../../.env')

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, envFilePath: ROOT_ENV_FILE, validate: validateEnv }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
