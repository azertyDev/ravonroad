import { readFileSync } from 'node:fs'
import { REPORT_STATUSES } from '@ravonroad/shared-types'
import { describe, expect, it } from 'vitest'
import { INTERNAL_STATUSES, STATUS_SHAPE, STATUS_SHAPES, STATUS_SLUG } from './statusShape'

describe('STATUS_SHAPE', () => {
  it('покрывает все семь статусов', () => {
    expect(Object.keys(STATUS_SHAPE).sort()).toEqual([...REPORT_STATUSES].sort())
  })

  it('даёт каждому статусу собственную форму', () => {
    const shapes = REPORT_STATUSES.map((status) => STATUS_SHAPE[status])
    expect(new Set(shapes).size).toBe(REPORT_STATUSES.length)
  })

  it('назначает формы в порядке дизайн-системы', () => {
    expect(REPORT_STATUSES.map((status) => STATUS_SHAPE[status])).toEqual([
      'ring',
      'diamond',
      'hatch',
      'check',
      'cross',
      'two-squares',
      'slash',
    ])
    expect([...STATUS_SHAPES]).toEqual(REPORT_STATUSES.map((status) => STATUS_SHAPE[status]))
  })
})

describe('STATUS_SLUG', () => {
  /** Плашка собирает имя токена из слага, поэтому опечатка в нём не ломает сборку —
   *  var() просто не находит токен, и плашка выходит прозрачной. Ловится только так. */
  const colors = readFileSync(new URL('../../styles/tokens/colors.css', import.meta.url), 'utf8')

  it('покрывает все семь статусов', () => {
    expect(Object.keys(STATUS_SLUG).sort()).toEqual([...REPORT_STATUSES].sort())
  })

  it('называет токены, которые действительно объявлены в палитре', () => {
    const missing = REPORT_STATUSES.flatMap((status) =>
      ['tint', 'ink', 'line', 'pin'].map((role) => `--status-${STATUS_SLUG[status]}-${role}`),
    ).filter((token) => !colors.includes(`${token}:`))

    expect(missing).toEqual([])
  })
})

describe('INTERNAL_STATUSES', () => {
  it('это ровно те три статуса, которых нет на публичной карте', () => {
    expect([...INTERNAL_STATUSES].sort()).toEqual(['DUPLICATE', 'OUT_OF_SCOPE', 'REJECTED'])
  })
})
