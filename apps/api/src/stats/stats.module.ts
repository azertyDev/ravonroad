import { Module } from '@nestjs/common'
import { RateLimitModule } from '../common/rate-limit.module'
import { PrismaModule } from '../prisma/prisma.module'
import { FormOpensController } from './form-opens.controller'
import { FormOpensService } from './form-opens.service'

@Module({
  imports: [PrismaModule, RateLimitModule],
  controllers: [FormOpensController],
  providers: [FormOpensService],
})
export class StatsModule {}
