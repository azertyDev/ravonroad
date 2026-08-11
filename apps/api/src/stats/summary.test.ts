import { describe, expect, it } from 'vitest'
import type { FilterableReport } from '../reports/filters'
import { summarize } from './summary'

const NOW = new Date('2026-08-11T06:00:00Z').getTime()
const DAY = 24 * 60 * 60 * 1000

function report(over: Partial<FilterableReport>): FilterableReport {
  return {
    status: 'NEW',
    categoryCode: 'roadway_pothole',
    districtCode: 'chilonzor',
    longitude: 69.24,
    latitude: 41.31,
    createdAt: new Date(NOW - DAY),
    doneAt: null,
    ...over,
  }
}

describe('summarize', () => {
  it('считает отремонтированные и очередь по статусам, а не по флагам', () => {
    const summary = summarize(
      [
        report({ status: 'DONE', doneAt: new Date(NOW - DAY) }),
        report({ status: 'DONE', doneAt: new Date(NOW - 30 * DAY) }),
        report({ status: 'NEW' }),
        report({ status: 'NEW' }),
        // Разобранные заявки в очереди уже не стоят: ими занялись.
        report({ status: 'ACCEPTED' }),
        report({ status: 'IN_PROGRESS' }),
      ],
      NOW,
    )
    expect(summary.done).toBe(2)
    expect(summary.queued).toBe(2)
  })

  it('в недельную прибавку берёт только последние семь суток', () => {
    const summary = summarize(
      [
        report({ status: 'DONE', doneAt: new Date(NOW - 6 * DAY) }),
        report({ status: 'DONE', doneAt: new Date(NOW - 8 * DAY) }),
      ],
      NOW,
    )
    expect(summary.done).toBe(2)
    expect(summary.doneLastWeek).toBe(1)
  })

  it('заявку без даты ремонта считает выполненной, но не свежей', () => {
    const summary = summarize([report({ status: 'DONE', doneAt: null })], NOW)
    expect(summary.done).toBe(1)
    expect(summary.doneLastWeek).toBe(0)
  })

  it('районы считает по различным кодам, а не по числу заявок', () => {
    const summary = summarize(
      [
        report({ districtCode: 'chilonzor' }),
        report({ districtCode: 'chilonzor' }),
        report({ districtCode: 'shayxontohur' }),
      ],
      NOW,
    )
    expect(summary.districts).toBe(2)
  })

  it('на пустом наборе отдаёт нули, а не пустоту', () => {
    expect(summarize([], NOW)).toEqual({ done: 0, doneLastWeek: 0, queued: 0, districts: 0 })
  })
})
