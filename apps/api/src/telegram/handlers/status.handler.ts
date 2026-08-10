import { Injectable } from '@nestjs/common'
import type { ReportStatus } from '@ravonroad/shared-types'
import { PrismaService } from '../../prisma/prisma.service'
import { applyTransition, isTerminal } from '../../reports/transitions'
import { CardUpdater } from '../card.updater'
import { STATUS_LABELS, displayNumber } from '../card.renderer'
import { applyOnce } from '../idempotency'
import { logEvent } from '../log'
import type { ActiveModerator } from '../moderator.guard'
import type { CallbackAnswer } from '../update'

/** Переход по кнопке модератора (US-019, US-023, US-026).
 *
 *  Один обработчик на все кнопочные переходы, включая двухшаговые: к моменту вызова
 *  причина уже выбрана, а номер оригинала уже введён, поэтому дальше они ничем
 *  не отличаются от «Принять». Второй копии транзакции, ответа и записи в очередь
 *  правок в системе нет.
 *
 *  Гонка решается условным `UPDATE` внутри `applyTransition` (SRS §6.6), а не
 *  блокировкой на время сетевого вызова: ноль изменённых строк — это отказ, а не ошибка. */
@Injectable()
export class StatusHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cards: CardUpdater,
  ) {}

  async apply(input: {
    updateId: number
    publicNumber: number
    to: ReportStatus
    moderator: ActiveModerator
    telegramUserId: number
    reason?: string
    reasonText?: string
    duplicateOfId?: number
  }): Promise<CallbackAnswer> {
    const outcome = await applyOnce(this.prisma, input.updateId, async (tx) => {
      const result = await applyTransition(tx, {
        publicNumber: input.publicNumber,
        to: input.to,
        actor: {
          type: 'MODERATOR',
          telegramUserId: BigInt(input.telegramUserId),
          moderatorId: input.moderator.id,
        },
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        ...(input.reasonText === undefined ? {} : { reasonText: input.reasonText }),
        ...(input.duplicateOfId === undefined ? {} : { duplicateOfId: input.duplicateOfId }),
      })
      if (!result.ok) return result

      // Терминальный переход даёт две правки: сейчас — с кнопкой отмены, через
      // 15 минут — уже без неё (SRS §6.10).
      if (isTerminal(result.to)) await this.cards.enqueueTerminalEdits(tx, result.reportId)
      else await this.cards.enqueueEdit(tx, result.reportId)
      return result
    })

    // Повторная доставка того же апдейта: эффект уже применён, второго не будет.
    if (outcome === null) return { text: 'Уже обработано' }

    if (outcome.ok) {
      logEvent('info', 'status_changed', {
        updateId: input.updateId,
        reportId: outcome.reportId,
        moderatorId: input.moderator.id,
        from: outcome.from,
        to: outcome.to,
      })
      return { text: `${displayNumber(input.publicNumber)} → ${STATUS_LABELS[outcome.to]}` }
    }

    switch (outcome.code) {
      case 'NOT_FOUND':
        return { text: 'Заявка не найдена', alert: true }
      case 'NO_AFTER_PHOTO':
        return { text: 'Нельзя закрыть заявку без фотографии «после»', alert: true }
      default:
        // И «переход не разрешён», и «строк не изменилось» с точки зрения нажавшего —
        // одно и то же: пока он думал, статус уехал (PRD 5.3.6).
        return { text: `Статус уже изменён на «${STATUS_LABELS[outcome.status]}»`, alert: true }
    }
  }
}
