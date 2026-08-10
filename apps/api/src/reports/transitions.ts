import { OUT_OF_SCOPE_REASON_CODES, REJECT_REASON_CODES, type ReportStatus } from '@ravonroad/shared-types'
import type { Prisma } from '../generated/prisma/client'

/** Машина состояний заявки (PRD §5.1).
 *
 *  Таблица ниже — единственный источник истины: обработчики бота не содержат ни одного
 *  собственного условия «а можно ли отсюда туда». Перехода нет в таблице — перехода нет
 *  вообще, и кнопки для него в карточке тоже нет. */

export type TransitionAction =
  | 'ACCEPT'
  | 'START'
  | 'RETURN'
  | 'REJECT'
  | 'DUPLICATE'
  | 'OUT_OF_SCOPE'
  | 'DONE'

export interface Transition {
  /** Номер строки таблицы PRD §5.1 — чтобы тест и разговор ссылались на одно и то же. */
  id: string
  from: ReportStatus
  to: ReportStatus
  action: TransitionAction
  actor: 'MODERATOR' | 'VOLUNTEER'
}

export const TRANSITIONS: readonly Transition[] = [
  { id: 'T-02', from: 'NEW', to: 'ACCEPTED', action: 'ACCEPT', actor: 'MODERATOR' },
  { id: 'T-03', from: 'NEW', to: 'REJECTED', action: 'REJECT', actor: 'MODERATOR' },
  { id: 'T-04', from: 'NEW', to: 'DUPLICATE', action: 'DUPLICATE', actor: 'MODERATOR' },
  { id: 'T-05', from: 'NEW', to: 'OUT_OF_SCOPE', action: 'OUT_OF_SCOPE', actor: 'MODERATOR' },
  { id: 'T-06', from: 'ACCEPTED', to: 'IN_PROGRESS', action: 'START', actor: 'MODERATOR' },
  { id: 'T-07', from: 'ACCEPTED', to: 'DONE', action: 'DONE', actor: 'VOLUNTEER' },
  { id: 'T-08', from: 'ACCEPTED', to: 'REJECTED', action: 'REJECT', actor: 'MODERATOR' },
  { id: 'T-09', from: 'ACCEPTED', to: 'DUPLICATE', action: 'DUPLICATE', actor: 'MODERATOR' },
  { id: 'T-10', from: 'ACCEPTED', to: 'OUT_OF_SCOPE', action: 'OUT_OF_SCOPE', actor: 'MODERATOR' },
  { id: 'T-11', from: 'IN_PROGRESS', to: 'DONE', action: 'DONE', actor: 'VOLUNTEER' },
  // «Вернуть в очередь»: сорвавшийся выезд не должен выглядеть как ошибка модератора,
  // поэтому обратный ход есть, и обе записи остаются в истории (PRD §4.2 п.7).
  { id: 'T-12', from: 'IN_PROGRESS', to: 'ACCEPTED', action: 'RETURN', actor: 'MODERATOR' },
  { id: 'T-13', from: 'IN_PROGRESS', to: 'OUT_OF_SCOPE', action: 'OUT_OF_SCOPE', actor: 'MODERATOR' },
]

/** Из терминальных обычных переходов нет — только отмена в течение 15 минут (PRD §5.4). */
export const TERMINAL_STATUSES: readonly ReportStatus[] = ['DONE', 'REJECTED', 'DUPLICATE', 'OUT_OF_SCOPE']

export function isTerminal(status: ReportStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

export function findTransition(from: ReportStatus, action: TransitionAction): Transition | undefined {
  return TRANSITIONS.find((transition) => transition.from === from && transition.action === action)
}

/** Переход задаётся парой «откуда, куда»: кнопка несёт целевой статус, а не действие
 *  (SRS §6.4), и «Принять» из `NEW` с «вернуть в очередь» из `IN_PROGRESS` — это одна
 *  и та же кнопка `AC` с разным названием. Пара уникальна: двух переходов между теми же
 *  статусами в таблице PRD §5.1 нет. */
export function findTransitionTo(from: ReportStatus, to: ReportStatus): Transition | undefined {
  return TRANSITIONS.find((transition) => transition.from === from && transition.to === to)
}

/** Переходы, доступные из статуса. По ним строится клавиатура карточки — поэтому кнопки
 *  и правила не могут разъехаться: список один. */
export function transitionsFrom(status: ReportStatus): Transition[] {
  return TRANSITIONS.filter((transition) => transition.from === status)
}

/** Причины обязательны при переходах в `REJECTED` и `OUT_OF_SCOPE`, номер оригинала —
 *  при `DUPLICATE` (PRD §5.2). Списки объявлены один раз в контракте и импортируются
 *  обеими сторонами: копия на сервере разъехалась бы со словарём локали (ADR-0006). */
export const REJECT_REASONS = REJECT_REASON_CODES
export const OUT_OF_SCOPE_REASONS = OUT_OF_SCOPE_REASON_CODES

export interface TransitionActor {
  type: 'SYSTEM' | 'MODERATOR' | 'VOLUNTEER'
  telegramUserId: bigint | null
  moderatorId: number | null
}

export interface TransitionRequest {
  publicNumber: number
  /** Целевой статус, а не действие: его знает каждый вызывающий, а какой это переход,
   *  выясняет таблица по текущему статусу заявки. */
  to: ReportStatus
  actor: TransitionActor
  reason?: string
  reasonText?: string
  /** `report.id` оригинала, а не его публичный номер: наружу `id` не выходит,
   *  а внутри ссылка обязана быть по первичному ключу. */
  duplicateOfId?: number
}

export type TransitionOutcome =
  | { ok: true; reportId: number; historyId: number; from: ReportStatus; to: ReportStatus }
  /** Заявки с таким номером нет. */
  | { ok: false; code: 'NOT_FOUND' }
  /** Переход не разрешён из текущего статуса — включая «уже здесь». */
  | { ok: false; code: 'NOT_ALLOWED'; status: ReportStatus }
  /** Статус изменился между чтением и записью: успел другой модератор (PRD 5.3.6). */
  | { ok: false; code: 'CHANGED'; status: ReportStatus }
  /** `DONE` без фотографии «после» — BR-006. */
  | { ok: false; code: 'NO_AFTER_PHOTO' }

interface StatusRow {
  id: number
  status: ReportStatus
}

/** Один переход целиком: проверка допустимости, условный `UPDATE` и строка истории.
 *
 *  Вызывается **внутри** транзакции вызывающего: у перехода почти всегда есть соседи
 *  по транзакции — `processed_update`, строки фотографий, запись в outbox, — и разрывать
 *  их на две транзакции значило бы допустить состояние «статус сменился, а карточка
 *  об этом не узнает».
 *
 *  Гонка решается в БД: `UPDATE ... WHERE status = :expected` (SRS §6.6). Ноль строк —
 *  это отказ, а не ошибка: второй нажавший получает «статус уже изменён на X».
 *  Никакого `SELECT ... FOR UPDATE` и никакой блокировки на время сетевого вызова. */
export async function applyTransition(
  tx: Prisma.TransactionClient,
  request: TransitionRequest,
): Promise<TransitionOutcome> {
  const current = await tx.$queryRaw<StatusRow[]>`
    SELECT id, status FROM report WHERE public_number = ${request.publicNumber}`
  const report = current[0]
  if (report === undefined) return { ok: false, code: 'NOT_FOUND' }

  const transition = findTransitionTo(report.status, request.to)
  if (transition === undefined) return { ok: false, code: 'NOT_ALLOWED', status: report.status }

  // BR-006 проверяется в той же транзакции, что и переход, а не постфактум (PRD 5.3.1).
  // Декларативно он не выражается: потребовал бы подсчёта строк в другой таблице,
  // то есть триггера, а триггер здесь дороже теста (SRS §2.2).
  if (transition.to === 'DONE') {
    const photos = await tx.reportPhoto.count({ where: { reportId: report.id, kind: 'AFTER' } })
    if (photos === 0) return { ok: false, code: 'NO_AFTER_PHOTO' }
  }

  const done = transition.to === 'DONE'
  const updated = await tx.$queryRaw<{ id: number }[]>`
    UPDATE report
       SET status = ${transition.to}::report_status,
           updated_at = now(),
           done_at = CASE WHEN ${done} THEN now() ELSE NULL END,
           status_reason = ${request.reason ?? null},
           status_reason_text = ${request.reasonText ?? null},
           duplicate_of_id = COALESCE(${request.duplicateOfId ?? null}::int, duplicate_of_id)
     WHERE id = ${report.id} AND status = ${report.status}::report_status
    RETURNING id`
  if (updated[0] === undefined) {
    // Кто-то успел раньше. Перечитываем, чтобы назвать нажавшему актуальный статус.
    const fresh = await tx.$queryRaw<StatusRow[]>`SELECT id, status FROM report WHERE id = ${report.id}`
    return { ok: false, code: 'CHANGED', status: fresh[0]?.status ?? report.status }
  }

  const history = await tx.reportStatusHistory.create({
    data: {
      reportId: report.id,
      fromStatus: report.status,
      toStatus: transition.to,
      actorType: request.actor.type,
      actorTelegramUserId: request.actor.telegramUserId,
      moderatorId: request.actor.moderatorId,
      reason: request.reason ?? null,
      reasonText: request.reasonText ?? null,
      duplicateOfId: request.duplicateOfId ?? null,
    },
    select: { id: true },
  })

  return { ok: true, reportId: report.id, historyId: history.id, from: report.status, to: transition.to }
}
