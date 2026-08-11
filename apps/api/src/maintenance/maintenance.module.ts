import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { CleanupService } from './cleanup.service'

/** Суточные обязательства перед жителем (SRS §9.8): сроки хранения соблюдает код,
 *  а не память дежурного. */
@Module({
  imports: [PrismaModule],
  providers: [CleanupService],
  exports: [CleanupService],
})
export class MaintenanceModule {}
