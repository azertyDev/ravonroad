import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { GeoService } from './geo.service'

@Module({
  imports: [PrismaModule],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
