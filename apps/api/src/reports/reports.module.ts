import { Module } from '@nestjs/common'
import { GeoModule } from '../geo/geo.module'
import { MediaModule } from '../media/media.module'
import { PrismaModule } from '../prisma/prisma.module'
import { RateLimiter } from '../common/rate-limit'
import { AbuseService } from './abuse.service'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [PrismaModule, GeoModule, MediaModule],
  controllers: [ReportsController],
  providers: [ReportsService, AbuseService, RateLimiter],
})
export class ReportsModule {}
