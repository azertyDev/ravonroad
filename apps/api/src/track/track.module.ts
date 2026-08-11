import { Module } from '@nestjs/common'
import { RateLimitModule } from '../common/rate-limit.module'
import { MediaModule } from '../media/media.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TrackController } from './track.controller'
import { TrackService } from './track.service'

@Module({
  imports: [PrismaModule, MediaModule, RateLimitModule],
  controllers: [TrackController],
  providers: [TrackService],
})
export class TrackModule {}
