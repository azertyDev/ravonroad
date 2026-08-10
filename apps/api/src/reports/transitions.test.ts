import { REPORT_STATUSES, type ReportStatus } from '@ravonroad/shared-types'
import { describe, expect, it } from 'vitest'
import {
  TRANSITIONS,
  findTransition,
  isTerminal,
  transitionsFrom,
  type TransitionAction,
} from './transitions'

const ACTIONS: TransitionAction[] = ['ACCEPT', 'START', 'RETURN', 'REJECT', 'DUPLICATE', 'OUT_OF_SCOPE', 'DONE']

/** Пары «статус × действие», разрешённые таблицей PRD §5.1. Список написан руками
 *  и отдельно от `TRANSITIONS` намеренно: тест, выведенный из проверяемой таблицы,
 *  проверяет только самого себя. */
const ALLOWED = new Set([
  'NEW:ACCEPT',
  'NEW:REJECT',
  'NEW:DUPLICATE',
  'NEW:OUT_OF_SCOPE',
  'ACCEPTED:START',
  'ACCEPTED:DONE',
  'ACCEPTED:REJECT',
  'ACCEPTED:DUPLICATE',
  'ACCEPTED:OUT_OF_SCOPE',
  'IN_PROGRESS:DONE',
  'IN_PROGRESS:RETURN',
  'IN_PROGRESS:OUT_OF_SCOPE',
])

describe('машина переходов', () => {
  it('содержит ровно 13 строк таблицы PRD §5.1 минус создание заявки', () => {
    expect(TRANSITIONS).toHaveLength(12)
    expect(new Set(TRANSITIONS.map((transition) => transition.id)).size).toBe(12)
  })

  it('разрешает ровно перечисленные пары и ни одной сверх', () => {
    for (const status of REPORT_STATUSES) {
      for (const action of ACTIONS) {
        const allowed = ALLOWED.has(`${status}:${action}`)
        expect(findTransition(status, action) !== undefined, `${status} × ${action}`).toBe(allowed)
      }
    }
  })

  it('не выпускает из терминальных статусов ни одним действием', () => {
    for (const status of REPORT_STATUSES.filter(isTerminal)) {
      expect(transitionsFrom(status)).toEqual([])
    }
  })

  it('в `DONE` пускает только волонтёра — фотографией, а не кнопкой', () => {
    const toDone = TRANSITIONS.filter((transition) => transition.to === 'DONE')
    expect(toDone.map((transition) => transition.actor)).toEqual(['VOLUNTEER', 'VOLUNTEER'])
  })

  it('не знает перехода в статус, которого нет в глоссарии', () => {
    const statuses: ReportStatus[] = [...REPORT_STATUSES]
    for (const transition of TRANSITIONS) {
      expect(statuses).toContain(transition.from)
      expect(statuses).toContain(transition.to)
    }
  })
})
