import { Injectable } from '@nestjs/common'
import type { ReportStatus } from '@ravonroad/shared-types'
import type { Prisma } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { UNDO_WINDOW_MS, UndoService } from '../reports/undo.service'
import { BotApiClient } from './bot-api.client'
import { REASON_LABELS, STATUS_LABELS } from './card.renderer'
import { CardUpdater } from './card.updater'
import { encodeCallbackData } from './callback-data'
import { DigestService } from './digest.service'
import { applyOnce } from './idempotency'
import { logEvent } from './log'
import type { ActiveModerator } from './moderator.guard'
import type { CallbackAnswer, IncomingCallbackQuery } from './update'

/** Пакетные действия (SRS §6.14).
 *
 *  Смысл один: сделать стоимость решения независимой от размера очереди. При всплеске
 *  очередь измеряется сотнями, и разбор по одной перестаёт быть работой, которую человек
 *  успевает делать.
 *
 *  Применяется только к заявкам в ожидаемом статусе: те, чей статус уже изменился, просто
 *  не попадают в `UPDATE`. История при этом остаётся поштучной — по строке на каждую
 *  затронутую заявку, иначе пропадёт аудит. */

interface AppliedRow {
  id: number
  public_number: number
}

@Injectable()
export class BatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: BotApiClient,
    private readonly cards: CardUpdater,
    private readonly digest: DigestService,
    private readonly undo: UndoService,
  ) {}

  async handle(input: {
    updateId: number
    batchId: number
    arg: string | undefined
    moderator: ActiveModerator
    query: IncomingCallbackQuery
  }): Promise<CallbackAnswer> {
    const arg = input.arg
    if (arg === undefined) return { text: 'Кнопка устарела', alert: true }

    // Второй шаг «Отклонить все»: причина обязательна и для пакета (PRD §5.2).
    if (arg === 'RJ') {
      await this.replaceKeyboard(input.query, this.digest.reasonKeyboard(input.batchId, 'REJECTED'))
      return { text: 'Выберите причину' }
    }
    if (arg === 'X') return this.unlinkCluster(input)
    if (arg === 'D') return this.applyStatus({ ...input, to: 'DUPLICATE' })
    if (arg === 'AC') return this.applyStatus({ ...input, to: 'ACCEPTED' })
    if (arg.startsWith('R-')) return this.applyStatus({ ...input, to: 'REJECTED', reason: arg.slice(2) })
    return { text: 'Кнопка устарела', alert: true }
  }

  /** «Раскрыть»: заявки пакета получают свои карточки — уже в пределах бюджета, потому
   *  что решение принимает человек и делает это не для всей очереди сразу. */
  async expand(batchId: number): Promise<CallbackAnswer> {
    const batch = await this.prisma.moderationBatch.findUnique({
      where: { id: batchId },
      select: { reportIds: true },
    })
    if (batch === null) return { text: 'Пакет не найден', alert: true }

    const pending = await this.prisma.report.findMany({
      where: { id: { in: batch.reportIds }, telegramCardMessageId: null, status: 'NEW' },
      select: { id: true },
    })
    await this.prisma.$transaction(async (tx) => {
      for (const report of pending) await this.cards.enqueueCreate(tx, report.id)
    })
    return { text: `Карточек будет отправлено: ${pending.length}` }
  }

  /** Отмена пакета целиком (SRS §6.14): 15 минут, только автор, одна кнопка. Отменять
   *  пакет поштучно — это снова поштучная работа, от которой пакет и уводит. */
  async undoBatch(input: {
    updateId: number
    batchId: number
    telegramUserId: number
    moderator: ActiveModerator
  }): Promise<CallbackAnswer> {
    const outcome = await applyOnce(this.prisma, input.updateId, async (tx) => {
      const batch = await tx.moderationBatch.findUnique({
        where: { id: input.batchId },
        select: { reportIds: true, appliedAt: true, appliedByModeratorId: true },
      })
      if (batch === null || batch.appliedAt === null) return { undone: 0, code: 'NOT_APPLIED' as const }
      if (batch.appliedByModeratorId !== input.moderator.id) return { undone: 0, code: 'NOT_AUTHOR' as const }
      if (Date.now() - batch.appliedAt.getTime() >= UNDO_WINDOW_MS) {
        return { undone: 0, code: 'EXPIRED' as const }
      }

      const rows = await tx.reportStatusHistory.findMany({
        where: { batchId: input.batchId, undoneAt: null },
        select: { id: true },
      })

      let undone = 0
      for (const row of rows) {
        const result = await this.undo.undo(tx, row.id, {
          telegramUserId: input.telegramUserId,
          moderatorId: input.moderator.id,
        })
        if (result.ok) undone += 1
      }
      // Пакет снова доступен к применению: отменённое решение не должно оставлять
      // пакет «уже обработанным».
      await tx.moderationBatch.update({
        where: { id: input.batchId },
        data: { appliedAt: null, appliedByModeratorId: null },
      })
      await this.cards.enqueueEditMany(tx, batch.reportIds)
      return { undone, code: 'OK' as const }
    })

    if (outcome === null) return { text: 'Уже обработано' }
    switch (outcome.code) {
      case 'NOT_APPLIED':
        return { text: 'Пакет ещё не применён', alert: true }
      case 'NOT_AUTHOR':
        return { text: 'Отменить может только тот, кто применил пакет', alert: true }
      case 'EXPIRED':
        return { text: 'Окно отмены истекло', alert: true }
      default:
        logEvent('info', 'batch_undone', { batchId: input.batchId, count: outcome.undone })
        return { text: `Отменено заявок: ${outcome.undone}` }
    }
  }

  private async applyStatus(input: {
    updateId: number
    batchId: number
    to: ReportStatus
    reason?: string
    moderator: ActiveModerator
    query: IncomingCallbackQuery
  }): Promise<CallbackAnswer> {
    const outcome = await applyOnce(this.prisma, input.updateId, async (tx) => {
      const batch = await tx.moderationBatch.findUnique({
        where: { id: input.batchId },
        select: { kind: true, reportIds: true, appliedAt: true },
      })
      if (batch === null) return { code: 'NOT_FOUND' as const }
      // Защита от повторного нажатия: пакет применяется один раз (SRS §6.14 п.4).
      if (batch.appliedAt !== null) return { code: 'ALREADY' as const }

      // Кластер: корень остаётся, дубликатами становятся все остальные. Обязательное
      // поле «номер оригинала» уже известно, поэтому второго шага не требуется.
      const root = batch.kind === 'DUPLICATE_CLUSTER' ? (batch.reportIds[0] ?? null) : null
      // Дубликат без оригинала запрещён инвариантом БД, и «все дубли» на digest-пакете
      // оригинала не имеет: у такого пакета нет корня.
      if (input.to === 'DUPLICATE' && root === null) return { code: 'NOT_FOUND' as const }
      const targets = input.to === 'DUPLICATE' && root !== null ? batch.reportIds.slice(1) : batch.reportIds

      const applied = await tx.$queryRaw<AppliedRow[]>`
        UPDATE report
           SET status = ${input.to}::report_status,
               updated_at = now(),
               status_reason = ${input.reason ?? null},
               duplicate_of_id = COALESCE(${root}::int, duplicate_of_id)
         WHERE id = ANY(${targets}) AND status = 'NEW'
        RETURNING id, public_number`

      for (const row of applied) {
        await tx.reportStatusHistory.create({
          data: {
            reportId: row.id,
            fromStatus: 'NEW',
            toStatus: input.to,
            actorType: 'MODERATOR',
            actorTelegramUserId: BigInt(input.query.from.id),
            moderatorId: input.moderator.id,
            reason: input.reason ?? null,
            duplicateOfId: root,
            // Строка знает свой пакет: по этой связи отмена возвращает весь состав.
            batchId: input.batchId,
          },
        })
      }
      await tx.moderationBatch.update({
        where: { id: input.batchId },
        data: { appliedAt: new Date(), appliedByModeratorId: input.moderator.id },
      })
      await this.cards.enqueueEditMany(
        tx,
        applied.map((row) => row.id),
      )
      return { code: 'OK' as const, applied: applied.length, total: targets.length }
    })

    if (outcome === null) return { text: 'Уже обработано' }
    if (outcome.code === 'NOT_FOUND') return { text: 'Пакет не найден', alert: true }
    if (outcome.code === 'ALREADY') return { text: 'Пакет уже обработан', alert: true }

    logEvent('info', 'batch_applied', {
      batchId: input.batchId,
      moderatorId: input.moderator.id,
      count: outcome.applied,
      to: input.to,
    })
    await this.showUndo(input.query, input.batchId)

    const reason = input.reason === undefined ? '' : `, причина «${REASON_LABELS[input.reason] ?? input.reason}»`
    return {
      text: `${STATUS_LABELS[input.to]}: применено к ${outcome.applied} из ${outcome.total}${reason}`,
    }
  }

  /** «Разные ямы»: гипотеза системы снимается, статусы не меняются. Гипотеза никогда
   *  не становится решением сама — и перестаёт быть гипотезой тоже только по нажатию. */
  private async unlinkCluster(input: {
    updateId: number
    batchId: number
    moderator: ActiveModerator
    query: IncomingCallbackQuery
  }): Promise<CallbackAnswer> {
    const outcome = await applyOnce(this.prisma, input.updateId, async (tx: Prisma.TransactionClient) => {
      const batch = await tx.moderationBatch.findUnique({
        where: { id: input.batchId },
        select: { reportIds: true },
      })
      if (batch === null) return null
      const cleared = await tx.report.updateMany({
        where: { id: { in: batch.reportIds }, duplicateCandidateOfId: { not: null } },
        data: { duplicateCandidateOfId: null },
      })
      // Заявки возвращаются в обычную очередь поштучно.
      for (const id of batch.reportIds) {
        const report = await tx.report.findUnique({ where: { id }, select: { telegramCardMessageId: true, status: true } })
        if (report?.telegramCardMessageId === null && report.status === 'NEW') await this.cards.enqueueCreate(tx, id)
      }
      return cleared.count
    })

    if (outcome === null) return { text: 'Пакет не найден', alert: true }
    return { text: `Связь снята у ${outcome} заявок, статусы не изменены` }
  }

  /** Кнопка отмены пакета живёт те же 15 минут. Снимать её отдельной записью не нужно:
   *  просроченное нажатие отклоняется по `applied_at`, а сообщение пакета — сводка,
   *  которая и так уходит вверх ленты. */
  private async showUndo(query: IncomingCallbackQuery, batchId: number): Promise<void> {
    await this.replaceKeyboard(query, [
      [{ text: '↩︎ Отменить пакет', callback_data: encodeCallbackData({ op: 'U', n: batchId }) }],
    ])
  }

  private async replaceKeyboard(
    query: IncomingCallbackQuery,
    keyboard: { text: string; callback_data: string }[][],
  ): Promise<void> {
    const message = query.message
    if (message === null) return
    await this.bot
      .call('editMessageReplyMarkup', {
        chat_id: String(message.chat.id),
        message_id: message.message_id,
        reply_markup: { inline_keyboard: keyboard },
      })
      .catch(() => undefined)
  }
}
