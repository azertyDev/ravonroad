import type { PrismaService } from '../prisma/prisma.service'
import { logEvent } from '../common/logger'

/** Первичный засев allowlist (ADR-0005, SRS §2.8).
 *
 *  `TELEGRAM_MODERATOR_IDS` — источник **первого** состава и больше ничего: дальше
 *  состав меняется `UPDATE`-ом в БД, без передеплоя и без изменения кода (US-024).
 *  Поэтому засев идемпотентен и никогда не удаляет: убрать идентификатор из переменной
 *  и ждать, что модератор потеряет права, нельзя — права снимаются `is_active = false`.
 *
 *  Живёт в `src`, а не в `prisma/seed`, как назвала задача T-066: `tsconfig` компилирует
 *  только `src`, а отдельный скрипт потребовал бы раннера TypeScript в образе миграций,
 *  то есть новой зависимости — а её полагается сначала согласовать (`CLAUDE.md`).
 *  Засев на старте процесса вдобавок не создаёт шага развёртывания, который можно забыть. */
export async function seedModerators(prisma: PrismaService, raw: string | undefined): Promise<number> {
  const ids = parseModeratorIds(raw)
  if (ids.length === 0) return 0

  const inserted = await prisma.$executeRaw`
    INSERT INTO moderator (telegram_user_id, added_by_moderator_id)
    SELECT id, NULL FROM unnest(${ids}::bigint[]) AS id
        ON CONFLICT (telegram_user_id) DO NOTHING`
  if (inserted > 0) logEvent('info', 'moderators_seeded', { count: inserted })
  return inserted
}

/** Мусор в переменной пропускается молча, а не роняет процесс: перечень правится руками,
 *  и лишняя запятая не должна оставлять кампанию без API. Пустой список — рабочее
 *  состояние: allowlist уже заполнен в БД. */
export function parseModeratorIds(raw: string | undefined): bigint[] {
  if (raw === undefined) return []
  const ids: bigint[] = []
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!/^[1-9][0-9]{0,18}$/.test(trimmed)) continue
    ids.push(BigInt(trimmed))
  }
  return ids
}
