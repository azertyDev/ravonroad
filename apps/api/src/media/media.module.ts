import { Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { PhotoWorker } from './photo.worker'
import { ProcessService } from './process.service'
import { S3Service } from './s3.service'

/** Всё, что касается файлов: хранилище, перекодирование и воркер очереди. Воркер живёт
 *  в том же процессе, что HTTP, — отдельного контейнера под него нет, потому что Redis
 *  и BullMQ не помещаются в бюджет 2 ГБ прода и 1 ГБ dev (ADR-0007). */
@Module({
  imports: [PrismaModule],
  providers: [S3Service, ProcessService, PhotoWorker],
  exports: [S3Service, ProcessService, PhotoWorker],
})
export class MediaModule {}
