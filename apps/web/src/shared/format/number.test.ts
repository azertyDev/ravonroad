import { describe, expect, it } from 'vitest'
import { formatNumber } from './number'

const THIN_SPACE = ' '
const NBSP = ' '

describe('formatNumber', () => {
  it('разделяет разряды тонким пробелом, как требует дизайн-система', () => {
    const formatted = formatNumber(10000)
    expect(formatted).toBe(`10${THIN_SPACE}000`)
    expect(formatted).toContain(THIN_SPACE)
    // U+00A0 стоял здесь, пока гарнитурой была IBM Plex Mono без глифа U+2009.
    // Возврат к нему означал бы, что гарнитуру поменяли, не проверив покрытие.
    expect(formatted).not.toContain(NBSP)
    expect(formatted).not.toContain(' ')
  })

  it('не трогает числа короче четырёх разрядов', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(7)).toBe('7')
    expect(formatNumber(999)).toBe('999')
  })

  it('ставит разделитель в каждой группе', () => {
    expect(formatNumber(1234567)).toBe(`1${THIN_SPACE}234${THIN_SPACE}567`)
  })

  it('сохраняет знак и отбрасывает дробную часть', () => {
    expect(formatNumber(-10000)).toBe(`-10${THIN_SPACE}000`)
    expect(formatNumber(10000.9)).toBe(`10${THIN_SPACE}000`)
  })
})
