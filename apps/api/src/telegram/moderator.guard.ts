import { Injectable, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { logEvent } from '../common/logger'
import { seedModerators } from './moderators.seed'

export interface ActiveModerator {
  id: number
  displayName: string | null
}

/** Сверка нажавшего с allowlist (US-024, SRS §6.2, §9.4).
 *
 *  Inline-кнопку в групповом сообщении видит и может нажать **любой** участник группы:
 *  персональных клавиатур в группе Telegram не существует, и любая схема вида «он
 *  не увидит кнопку» нерабочая по построению. Поэтому защита исключительно серверная
 *  и стоит **до любой записи в БД** — шаг 2 из пяти, раньше проверки допустимости
 *  перехода и раньше транзакции.
 *
 *  Попытка постороннего попадает в журнал системы и **не** попадает в публичную историю
 *  заявки: история — это решения по заявке, а не список тех, кто мимо проходил. */
@Injectable()
export class ModeratorGuard implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Первичный засев состава при первом развёртывании (ADR-0005). Идемпотентен, поэтому
   *  безопасно выполняется на каждом старте; отказ БД на старте не роняет процесс —
   *  `/health` обязан отвечать при недоступной базе (SRS §10.1). */
  async onModuleInit(): Promise<void> {
    try {
      await seedModerators(this.prisma, this.config.get<string>('TELEGRAM_MODERATOR_IDS'))
    } catch (error) {
      logEvent('error', 'moderators_seed_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** `null` — нажавшего нет в allowlist или он деактивирован. Ни одной записи в БД
   *  этот путь не делает: состав allowlist меняется `UPDATE`-ом в psql, а не нажатиями. */
  async check(telegramUserId: number): Promise<ActiveModerator | null> {
    const moderator = await this.prisma.moderator.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), isActive: true },
      select: { id: true, displayName: true },
    })
    return moderator
  }

  /** Отказ логируется здесь, а не в каждом обработчике: место одно — значит, и формат
   *  события один, и забыть его нельзя (SRS §10.2). */
  reject(telegramUserId: number, updateId: number): void {
    logEvent('warn', 'unauthorized_button_press', { telegramUserId, updateId })
  }
}
