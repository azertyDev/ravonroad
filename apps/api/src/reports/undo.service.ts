import { Injectable } from '@nestjs/common'
import type { ReportStatus } from '@ravonroad/shared-types'
import type { Prisma } from '../generated/prisma/client'
import { isTerminal } from './transitions'

/** Окно отмены — 15 минут (PRD §5.4, SRS §6.10).
 *
 *  Ошибочный тап — не гипотеза, а рядовое событие: модератор разбирает очередь
 *  с телефона, кнопки стоят вплотную, а `REJECTED` убирает реальную яму с карты
 *  и показывает заявителю причину отказа. */
export const UNDO_WINDOW_MS = 15 * 60 * 1000

export type UndoOutcome =
  | { ok: true; reportId: number; publicNumber: number; from: ReportStatus; to: ReportStatus }
  | { ok: false; code: 'NOT_FOUND' }
  /** Окно истекло. Кнопка могла остаться на экране у того, кто не перерисовывал чат. */
  | { ok: false; code: 'EXPIRED' }
  /** Отменяет только автор перехода — кем бы он ни был (SRS §6.10). */
  | { ok: false; code: 'NOT_AUTHOR' }
  /** Переход уже отменён или после него был другой: история не переписывается. */
  | { ok: false; code: 'NOT_LAST' }

export interface UndoActor {
  telegramUserId: number
  moderatorId: number | null
}

interface HistoryRow {
  id: number
  report_id: number
  public_number: number
  from_status: ReportStatus | null
  to_status: ReportStatus
  actor_telegram_user_id: bigint | null
  undone_at: Date | null
  created_at: Date
  current_status: ReportStatus
}

/** Отмена перехода (PRD §5.4).
 *
 *  Отмена — **новая строка** истории, а не правка старой: инвариант PRD 5.3.4 требует,
 *  чтобы история не переписывалась задним числом, и житель, открывший `/z/<token>`,
 *  видел и переход, и его отмену.
 *
 *  Двойная отмена закрыта уникальным частичным индексом `history_undo_once_idx`, а не
 *  проверкой в коде: нажать «Отменить» можно из двух сессий одновременно, и проверка
 *  в коде проиграла бы эту гонку. */
@Injectable()
export class UndoService {
  /** Кнопка «Отменить» показывается, пока запись отменяема. Правило одно и здесь же,
   *  поэтому карточка и обработчик не могут разойтись во мнении о том, что видно. */
  canUndo(row: { toStatus: ReportStatus; undoneAt: Date | null; createdAt: Date }, now = Date.now()): boolean {
    return (
      isTerminal(row.toStatus) &&
      row.undoneAt === null &&
      now - row.createdAt.getTime() < UNDO_WINDOW_MS
    )
  }

  /** Вызывается внутри транзакции апдейта: отмена, строка истории и правка карточки
   *  обязаны быть одним фактом. */
  async undo(tx: Prisma.TransactionClient, historyId: number, actor: UndoActor): Promise<UndoOutcome> {
    const rows = await tx.$queryRaw<HistoryRow[]>`
      SELECT h.id, h.report_id, r.public_number, h.from_status, h.to_status,
             h.actor_telegram_user_id, h.undone_at, h.created_at, r.status AS current_status
        FROM report_status_history h
        JOIN report r ON r.id = h.report_id
       WHERE h.id = ${historyId}`
    const row = rows[0]
    if (row === undefined || row.from_status === null) return { ok: false, code: 'NOT_FOUND' }

    // Порядок проверок — от самой дешёвой к самой болезненной для нажавшего: «не автор»
    // должно звучать раньше, чем «поздно», иначе посторонний узнаёт про окно отмены.
    if (row.actor_telegram_user_id === null || Number(row.actor_telegram_user_id) !== actor.telegramUserId) {
      return { ok: false, code: 'NOT_AUTHOR' }
    }
    if (row.undone_at !== null) return { ok: false, code: 'NOT_LAST' }
    if (Date.now() - row.created_at.getTime() >= UNDO_WINDOW_MS) return { ok: false, code: 'EXPIRED' }

    const last = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM report_status_history
       WHERE report_id = ${row.report_id}
       ORDER BY created_at DESC, id DESC LIMIT 1`
    if (last[0]?.id !== row.id) return { ok: false, code: 'NOT_LAST' }

    // Возврат условный по тем же соображениям, что и переход (SRS §6.6): между чтением
    // и записью статус мог уехать, и тогда отменять уже нечего.
    const reverted = await tx.$queryRaw<{ id: number }[]>`
      UPDATE report
         SET status = ${row.from_status}::report_status,
             updated_at = now(),
             -- Счётчик считается запросом, а не хранимым числом, поэтому уменьшать его
             -- отдельно не нужно: заявка просто перестаёт попадать в выборку (PRD 5.3.2).
             done_at = NULL,
             status_reason = NULL,
             status_reason_text = NULL,
             -- Ссылка на оригинал — решение модератора, а мы отменяем именно решение.
             duplicate_of_id = CASE WHEN ${row.to_status} = 'DUPLICATE' THEN NULL ELSE duplicate_of_id END
       WHERE id = ${row.report_id} AND status = ${row.to_status}::report_status
      RETURNING id`
    if (reverted[0] === undefined) return { ok: false, code: 'NOT_LAST' }

    await tx.reportStatusHistory.update({ where: { id: row.id }, data: { undoneAt: new Date() } })
    await tx.reportStatusHistory.create({
      data: {
        reportId: row.report_id,
        fromStatus: row.to_status,
        toStatus: row.from_status,
        actorType: actor.moderatorId === null ? 'VOLUNTEER' : 'MODERATOR',
        actorTelegramUserId: BigInt(actor.telegramUserId),
        moderatorId: actor.moderatorId,
        undoesHistoryId: row.id,
      },
    })

    return {
      ok: true,
      reportId: row.report_id,
      publicNumber: row.public_number,
      from: row.to_status,
      to: row.from_status,
    }
  }
}
