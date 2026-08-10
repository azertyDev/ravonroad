import type { Prisma } from '../generated/prisma/client'
import type { PrismaService } from '../prisma/prisma.service'

/** Идемпотентность апдейтов (SRS §6.11).
 *
 *  Telegram повторяет апдейт, пока не получит `2xx`, поэтому повторная доставка — это
 *  норма, а не сбой. Первый рубеж — вставка `update_id` **в той же транзакции**, что
 *  и эффект: либо есть и строка, и эффект, либо нет ни того, ни другого. Второй рубеж —
 *  `photo_dedup_idx` по `sha256`, третий — условный `UPDATE ... WHERE status`. */

const UNIQUE_VIOLATION = 'P2002'

/** `false` — апдейт уже обработан. Вызывается **первой** операцией транзакции, чтобы
 *  повтор откатывал ещё пустую транзакцию. */
export async function claimUpdate(tx: Prisma.TransactionClient, updateId: number): Promise<boolean> {
  try {
    await tx.processedUpdate.create({ data: { updateId } })
    return true
  } catch (error) {
    if (isUniqueViolation(error)) return false
    throw error
  }
}

/** Эффект апдейта целиком: одна транзакция, в которой первым делом занимается `update_id`.
 *
 *  `null` означает «этот апдейт уже применён» — вызывающий отвечает `200` и ничего
 *  не делает. Транзиентная ошибка выходит наружу исключением и превращается в `500`:
 *  пусть Telegram повторит (SRS §6.11). */
export async function applyOnce<T>(
  prisma: PrismaService,
  updateId: number,
  effect: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    if (!(await claimUpdate(tx, updateId))) return null
    return effect(tx)
  })
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION
}
