import { Module } from '@nestjs/common'
import { RateLimitModule } from '../common/rate-limit.module'
import { PrismaModule } from '../prisma/prisma.module'
import { FormOpensController } from './form-opens.controller'
import { FormOpensService } from './form-opens.service'
import { PointsCache } from './points-cache'
import { StatsController } from './stats.controller'

@Module({
  imports: [PrismaModule, RateLimitModule],
  controllers: [FormOpensController, StatsController],
  providers: [FormOpensService, PointsCache],
  // Кэш точек держит и счётчик, и карту: один проход по БД на оба ответа (SRS §4.7).
  exports: [PointsCache],
})
export class StatsModule {}
