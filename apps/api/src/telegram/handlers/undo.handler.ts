import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { UndoService } from '../../reports/undo.service'
import { STATUS_LABELS, displayNumber } from '../card.renderer'
import { CardUpdater } from '../card.updater'
import { applyOnce } from '../idempotency'
import { logEvent } from '../../common/logger'
import type { ActiveModerator } from '../moderator.guard'
import type { CallbackAnswer } from '../update'

/** Отмена перехода в течение 15 минут (PRD §5.4, SRS §6.10).
 *
 *  **Кто может нажать.** Единственная кнопка в системе, для которой членство в allowlist
 *  не является условием: отменяет строго автор перехода, а автором перехода в `DONE`
 *  является волонтёр, приславший фотографии, и он модератором быть не обязан (PRD §12.4).
 *  Требование быть модератором оставило бы ошибочно закрытую заявку закрытой. Проверка
 *  авторства при этом строже проверки allowlist: она называет одного конкретного человека,
 *  а не список.
 *
 *  Кнопка исчезает через 15 минут сама — второй записью в outbox, а не планировщиком
 *  (SRS §6.10). Опоздавшее нажатие по оставшейся на экране кнопке получает alert. */
@Injectable()
export class UndoHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly undo: UndoService,
    private readonly cards: CardUpdater,
  ) {}

  async handle(input: {
    updateId: number
    historyId: number
    telegramUserId: number
    moderator: ActiveModerator | null
  }): Promise<CallbackAnswer> {
    const outcome = await applyOnce(this.prisma, input.updateId, async (tx) => {
      const result = await this.undo.undo(tx, input.historyId, {
        telegramUserId: input.telegramUserId,
        moderatorId: input.moderator?.id ?? null,
      })
      if (result.ok) await this.cards.enqueueEdit(tx, result.reportId)
      return result
    })

    if (outcome === null) return { text: 'Уже обработано' }
    if (outcome.ok) {
      logEvent('info', 'status_undone', {
        updateId: input.updateId,
        reportId: outcome.reportId,
        from: outcome.from,
        to: outcome.to,
        ...(input.moderator === null ? {} : { moderatorId: input.moderator.id }),
      })
      return {
        text: `${displayNumber(outcome.publicNumber)} → ${STATUS_LABELS[outcome.to]} (отменено)`,
      }
    }

    switch (outcome.code) {
      case 'NOT_AUTHOR':
        return { text: 'Отменить может только тот, кто сделал переход', alert: true }
      case 'EXPIRED':
        return { text: 'Окно отмены истекло', alert: true }
      case 'NOT_LAST':
        return { text: 'Этот переход уже отменён или после него были другие', alert: true }
      default:
        return { text: 'Переход не найден', alert: true }
    }
  }
}
