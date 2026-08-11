import { Module } from '@nestjs/common'
import { MediaModule } from '../media/media.module'
import { PrismaModule } from '../prisma/prisma.module'
import { ReportsModule } from '../reports/reports.module'
import { BatchService } from './batch.service'
import { BotApiClient } from './bot-api.client'
import { CardRenderer } from './card.renderer'
import { CardUpdater } from './card.updater'
import { DigestService } from './digest.service'
import { DuplicatesService } from './duplicates.service'
import { AlertsService } from './alerts.service'
import { AfterPhotoHandler } from './handlers/after-photo.handler'
import { PromptHandler } from './handlers/prompt.handler'
import { PublicationHandler } from './handlers/publication.handler'
import { ReasonHandler } from './handlers/reason.handler'
import { StatusHandler } from './handlers/status.handler'
import { UndoHandler } from './handlers/undo.handler'
import { ModeratorGuard } from './moderator.guard'
import { OutboxWorker } from './outbox.worker'
import { WebhookController } from './webhook.controller'
import { WebhookHealthService } from './webhook-health.service'

/** Telegram-бот — обычный модуль Nest, а не отдельный сервис и не отдельный процесс
 *  (ADR-0002): он меняет те же агрегаты, что и API, и вынос его за границу процесса
 *  создал бы вторую точку, где нужно повторить проверки статусов, allowlist и инварианта
 *  фотографий, не купив ничего взамен. Плюс один контейнер Node — это ~250 МБ при бюджете
 *  1 ГБ на dev, то есть выбор между «два процесса» и «работает». */
@Module({
  imports: [PrismaModule, MediaModule, ReportsModule],
  controllers: [WebhookController],
  providers: [
    BotApiClient,
    ModeratorGuard,
    CardRenderer,
    CardUpdater,
    DigestService,
    DuplicatesService,
    BatchService,
    StatusHandler,
    ReasonHandler,
    PromptHandler,
    UndoHandler,
    AfterPhotoHandler,
    PublicationHandler,
    OutboxWorker,
    WebhookHealthService,
    AlertsService,
  ],
  // `/health/details` показывает состояние webhook (SRS §10.1) — те же 60 секунд кэша,
  // что и у проверки алертов, поэтому сервис один на обоих потребителей.
  exports: [CardUpdater, OutboxWorker, WebhookHealthService, AlertsService],
})
export class TelegramModule {}
