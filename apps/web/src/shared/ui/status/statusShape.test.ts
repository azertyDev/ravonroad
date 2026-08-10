import { REPORT_STATUSES } from '@ravonroad/shared-types'
import { describe, expect, it } from 'vitest'
import { STATUS_SHAPE, STATUS_SHAPES } from './statusShape'

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
