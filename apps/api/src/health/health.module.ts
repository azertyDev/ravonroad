import { Module } from '@nestjs/common'
import { MediaModule } from '../media/media.module'
import { PrismaModule } from '../prisma/prisma.module'
import { TelegramModule } from '../telegram/telegram.module'
import { HealthDetailsController } from './details.controller'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'

/** `/health` и `/ready` не зависят ни от чего, кроме БД, — это их свойство, а не
 *  недоработка (SRS §10.1). Хранилище и Telegram нужны только `/health/details`,
 *  поэтому модули приезжают сюда ради одного контроллера. */
@Module({
  imports: [PrismaModule, MediaModule, TelegramModule],
  controllers: [HealthController, HealthDetailsController],
  providers: [HealthService],
})
export class HealthModule {}
