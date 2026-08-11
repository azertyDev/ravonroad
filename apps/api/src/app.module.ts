import { resolve } from 'node:path'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CatalogModule } from './catalog/catalog.module'
import { validateEnv } from './config/env'
import { HealthModule } from './health/health.module'
import { MaintenanceModule } from './maintenance/maintenance.module'
import { MediaModule } from './media/media.module'
import { PrismaModule } from './prisma/prisma.module'
import { ReportsModule } from './reports/reports.module'
import { StatsModule } from './stats/stats.module'
import { TelegramModule } from './telegram/telegram.module'
import { TrackModule } from './track/track.module'

// .env лежит в корне монорепозитория, а процесс запускается из apps/api — и `nest start`,
// и `node dist/main.js`. Без явного пути ConfigModule искал бы файл в apps/api, не находил
// и падал на валидации. Тот же расчёт, что в prisma.config.ts: в контейнере файла нет,
// отсутствующий путь ConfigModule молча пропускает, а переменные приходят из окружения.
const ROOT_ENV_FILE = resolve(process.cwd(), '../../.env')

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ROOT_ENV_FILE,
      // В тестах окружение задаёт стенд, а не .env разработчика. Без этого прогон
      // подхватывал бы боевые ключи S3 и писал бы мусор в настоящий бакет кампании —
      // значения из файла в @nestjs/config перекрывают process.env, а не наоборот.
      ignoreEnvFile: process.env['NODE_ENV'] === 'test',
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    CatalogModule,
    MaintenanceModule,
    MediaModule,
    ReportsModule,
    StatsModule,
    TelegramModule,
    TrackModule,
  ],
})
export class AppModule {}
