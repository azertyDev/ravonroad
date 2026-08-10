import { describe, expect, it } from 'vitest'
import { formatNumber } from './number'

const NBSP = '\u00A0'
const THIN_SPACE = '\u2009'

describe('formatNumber', () => {
  it('разделяет разряды неразрывным пробелом, а не тонким', () => {
    const formatted = formatNumber(10000)
    expect(formatted).toBe(`10${NBSP}000`)
    expect(formatted).toContain(NBSP)
    expect(formatted).not.toContain(THIN_SPACE)
    expect(formatted).not.toContain(' ')
  })

  it('не трогает числа короче четырёх разрядов', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(7)).toBe('7')
    expect(formatNumber(999)).toBe('999')
  })

  it('ставит разделитель в каждой группе', () => {
    expect(formatNumber(1234567)).toBe(`1${NBSP}234${NBSP}567`)
  })

  it('сохраняет знак и отбрасывает дробную часть', () => {
    expect(formatNumber(-10000)).toBe(`-10${NBSP}000`)
    expect(formatNumber(10000.9)).toBe(`10${NBSP}000`)
  })
})
