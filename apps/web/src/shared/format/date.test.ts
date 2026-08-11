import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, repairDays } from './date'

describe('даты', () => {
  // Полдень UTC: в любом поясе от -11 до +11 это тот же день, и тест не зависит
  // от того, где запущен CI.
  const noon = '2026-08-10T12:00:00.000Z'

  it('пишет дату числами с ведущими нулями', () => {
    expect(formatDate(noon)).toBe('10.08.2026')
    expect(formatDate('2026-01-02T12:00:00.000Z')).toBe('02.01.2026')
  })

  it('добавляет время к дате перехода', () => {
    expect(formatDateTime(noon)).toMatch(/^10\.08\.2026, \d{2}:\d{2}$/)
  })

  it('считает срок ремонта в сутках и никогда не даёт ноль', () => {
    expect(repairDays(noon, '2026-08-14T12:00:00.000Z')).toBe(4)
    // Три часа — это тот же день, но «0 kunda» под фотографией читается как поломка.
    expect(repairDays(noon, '2026-08-10T15:00:00.000Z')).toBe(1)
  })
})
