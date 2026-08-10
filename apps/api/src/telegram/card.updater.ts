import { Injectable } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client'
import { UNDO_WINDOW_MS } from '../reports/undo.service'
import type { SendMessageParams } from './bot-api.client'

/** Постановка исходящих в очередь (SRS §6.6, §6.7, §6.10).
 *
 *  Ни один обработчик не зовёт Bot API напрямую в транзакции перехода: сеть внутри
 *  транзакции означает открытую транзакцию на время сетевого таймаута. В очередь кладётся
 *  строка, отправляет её воркер. */
@Injectable()
export class CardUpdater {
  /** Карточка новой заявки. Ставится после обработки последнего `BEFORE`-фото,
   *  а не при создании заявки: до этого фотографий, ради которых карточка и нужна,
   *  ещё нет (SRS §1.3 п.7). */
  async enqueueCreate(tx: Prisma.TransactionClient, reportId: number): Promise<void> {
    await tx.telegramOutbox.create({ data: { reportId, kind: 'CARD_CREATE', payload: {} } })
  }

  /** Правка карточки после перехода.
   *
   *  Перед вставкой удаляются неотправленные правки этой же заявки, чей срок уже
   *  наступил: смысл имеет только последнее состояние, а три правки подряд — это три
   *  сообщения из бюджета в двадцать (SRS §6.6). Отложенная правка (снятие кнопки
   *  отмены) при этом переживает схлопывание — у неё срок позже. */
  async enqueueEdit(tx: Prisma.TransactionClient, reportId: number, delayMs = 0): Promise<void> {
    const dueAt = new Date(Date.now() + delayMs)
    // Схлопывает только немедленная правка и только немедленные: смысл имеет последнее
    // состояние, но отложенная — снятие кнопки отмены — не заменяет собой ту, что должна
    // уйти сейчас. Она ставится сразу после неё и стёрла бы её условием «всё, что раньше».
    if (delayMs === 0) {
      await tx.telegramOutbox.deleteMany({
        where: { reportId, kind: 'CARD_EDIT', sentAt: null, nextAttemptAt: { lte: dueAt } },
      })
    }
    await tx.telegramOutbox.create({
      data: { reportId, kind: 'CARD_EDIT', payload: {}, nextAttemptAt: dueAt },
    })
  }

  /** Правки для пакета заявок. Заявки, у которых карточки в группе нет (они ушли
   *  строкой в digest), пропускаются: править нечего, а строка в очереди висела бы
   *  вечно, потому что `message_id` у них не появится никогда (SRS §6.13). */
  async enqueueEditMany(tx: Prisma.TransactionClient, reportIds: number[]): Promise<void> {
    const withCard = await tx.report.findMany({
      where: { id: { in: reportIds }, telegramCardMessageId: { not: null } },
      select: { id: true },
    })
    for (const report of withCard) await this.enqueueEdit(tx, report.id)
  }

  /** Терминальный переход даёт две правки: сейчас — с кнопкой «Отменить», и через
   *  15 минут — уже без неё. Планировщика в системе не появляется: у outbox есть
   *  колонка «когда», и этого достаточно (SRS §6.10). */
  async enqueueTerminalEdits(tx: Prisma.TransactionClient, reportId: number): Promise<void> {
    await this.enqueueEdit(tx, reportId)
    await this.enqueueEdit(tx, reportId, UNDO_WINDOW_MS)
  }

  /** Ответ бота в группу: подсказка волонтёру, отчёт о применении пакета, отказ.
   *  Идёт через ту же очередь, что и карточки, потому что тратит тот же бюджет
   *  в 20 сообщений в минуту (SRS §6.7). */
  async enqueueReply(
    tx: Prisma.TransactionClient,
    params: SendMessageParams,
    reportId: number | null = null,
  ): Promise<void> {
    await tx.telegramOutbox.create({
      data: { reportId, kind: 'REPLY', payload: { method: 'sendMessage', params } as unknown as Prisma.InputJsonValue },
    })
  }
}
