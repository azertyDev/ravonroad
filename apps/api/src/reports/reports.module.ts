import { Module } from '@nestjs/common'
import { GeoModule } from '../geo/geo.module'
import { S3Module } from '../media/s3.module'
import { PrismaModule } from '../prisma/prisma.module'
import { RateLimiter } from '../common/rate-limit'
import { AbuseService } from './abuse.service'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'

@Module({
  imports: [PrismaModule, GeoModule, S3Module],
  controllers: [ReportsController],
  providers: [ReportsService, AbuseService, RateLimiter],
})
export class ReportsModule {}
