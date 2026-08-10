import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { DuplicatesService } from './duplicates.service'
import { GeoService } from './geo.service'

@Module({
  imports: [PrismaModule],
  providers: [GeoService, DuplicatesService],
  exports: [GeoService, DuplicatesService],
})
export class GeoModule {}
