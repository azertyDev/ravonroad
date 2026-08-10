import { Module } from '@nestjs/common'
import { GeoModule } from '../geo/geo.module'
import { MediaModule } from '../media/media.module'
import { PrismaModule } from '../prisma/prisma.module'
import { RateLimitModule } from '../common/rate-limit.module'
import { AbuseService } from './abuse.service'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [PrismaModule, GeoModule, MediaModule, RateLimitModule],
  controllers: [ReportsController],
  providers: [ReportsService, AbuseService],
})
export class ReportsModule {}
