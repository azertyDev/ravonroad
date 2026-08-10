import { Module } from '@nestjs/common'
import { GeoModule } from '../geo/geo.module'
import { MediaModule } from '../media/media.module'
import { PrismaModule } from '../prisma/prisma.module'
import { RateLimitModule } from '../common/rate-limit.module'
import { StatsModule } from '../stats/stats.module'
import { AbuseService } from './abuse.service'
import { PublicReportsController } from './public-reports.controller'
import { PublicReportsService } from './public-reports.service'
import { ReportsController } from './reports.controller'
import { ReportsService } from './reports.service'
import { UndoService } from './undo.service'

@Module({
  imports: [PrismaModule, GeoModule, MediaModule, RateLimitModule, StatsModule],
  controllers: [ReportsController, PublicReportsController],
  providers: [ReportsService, AbuseService, PublicReportsService, UndoService],
  // Отмену перехода вызывает бот: кнопка живёт в карточке, а правило — здесь,
  // рядом с машиной состояний (SRS §6.10).
  exports: [UndoService],
})
export class ReportsModule {}
