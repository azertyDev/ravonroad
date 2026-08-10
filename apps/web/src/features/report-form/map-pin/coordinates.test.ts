import { describe, expect, it } from 'vitest'
import { formatCoordinate, parseCoordinate, roundCoordinate } from './coordinates'

describe('координаты пина (AC-2)', () => {
  it('держит шесть знаков после запятой', () => {
    expect(roundCoordinate(41.2755123456)).toBe(41.275512)
    expect(formatCoordinate(41.2755)).toBe('41.275500')
  })

  it('принимает запятую как разделитель', () => {
    // Обычная раскладка даёт запятую, и требовать точку значило бы требовать
    // от человека знания формата.
    expect(parseCoordinate('41,275512')).toBe(41.275512)
    expect(parseCoordinate('  69.204411 ')).toBe(69.204411)
  })

  it('считает пустое поле пустым, а мусор — отсутствием значения', () => {
    expect(parseCoordinate('')).toBeNull()
    expect(parseCoordinate('   ')).toBeNull()
    expect(parseCoordinate('около рынка')).toBeNull()
  })

  it('переживает круг «пин → поле → пин» без потери точности', () => {
    // Поле и пин связаны с одним состоянием, и значение обязано пережить
    // преобразование в текст и обратно (T-039).
    const fromPin = roundCoordinate(41.2755124)
    expect(parseCoordinate(formatCoordinate(fromPin))).toBe(fromPin)
  })
})
