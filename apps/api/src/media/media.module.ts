import { Module } from '@nestjs/common'
import { ProcessService } from './process.service'
import { S3Service } from './s3.service'

/** Всё, что касается файлов: хранилище и перекодирование. Воркер очереди живёт здесь же
 *  и в том же процессе, что HTTP, — отдельного контейнера под него нет (ADR-0007). */
@Module({
  providers: [S3Service, ProcessService],
  exports: [S3Service, ProcessService],
})
export class MediaModule {}
