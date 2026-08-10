import type { Prisma } from '../generated/prisma/client'

/** Приоритет очереди модерации (SRS §6.14).
 *
 *  Хранимой колонки приоритета нет намеренно: приоритет — производная от текущего
 *  состояния соседей, и хранимое поле пришлось бы пересчитывать при каждом изменении
 *  любого из них. При активной очереди в сотни строк (частичный индекс `report_queue_idx`)
 *  подзапросы стоят миллисекунды.
 *
 *  Логика порядка: кластер из двадцати заявок закрывается одним нажатием и убирает
 *  из очереди двадцать позиций — это самая выгодная работа. Заявки с флагом антиабуза
 *  идут последними: они требуют внимания и не должны занимать модератора, пока есть
 *  очевидная работа. Дальше — FIFO, потому что житель, подавший раньше, ждёт дольше. */

export interface PendingCard {
  outbox_id: bigint
  report_id: number
  public_number: number
}

/** Неотправленные карточки в порядке приоритета — так формируется состав пакета.
 *  Поштучная отправка идёт по `id` очереди, то есть FIFO: там приоритет ничего
 *  не экономит, а порядок «кто раньше пришёл» честнее. */
export function pendingCardsByPriority(
  tx: Prisma.TransactionClient,
  limit: number,
): Promise<PendingCard[]> {
  return tx.$queryRaw<PendingCard[]>`
    SELECT o.id AS outbox_id, r.id AS report_id, r.public_number
      FROM telegram_outbox o
      JOIN report r ON r.id = o.report_id
     WHERE o.kind = 'CARD_CREATE' AND o.sent_at IS NULL AND o.next_attempt_at <= now()
       AND r.status = 'NEW'
     ORDER BY (SELECT count(*) FROM report c WHERE c.duplicate_candidate_of_id = r.id) DESC,
              EXISTS (SELECT 1 FROM abuse_signal a WHERE a.report_id = r.id) ASC,
              r.created_at ASC
     LIMIT ${limit}
       FOR UPDATE OF o SKIP LOCKED`
}

/** Глубина очереди модерации: заявки в `NEW`, чья карточка ещё не ушла. Она же —
 *  условие переключения в digest (SRS §6.13) и метрика `queue_depth` (SRS §10.3). */
export async function pendingCardCount(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT count(*) AS count
      FROM telegram_outbox o
      JOIN report r ON r.id = o.report_id
     WHERE o.kind = 'CARD_CREATE' AND o.sent_at IS NULL AND r.status = 'NEW'`
  return Number(rows[0]?.count ?? 0)
}
