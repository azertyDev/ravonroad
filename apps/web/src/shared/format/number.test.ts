import { describe, expect, it } from 'vitest'
import { formatDistance, formatNumber, formatPercent } from './number'

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

describe('formatDistance', () => {
  it('до километра считает метрами', () => {
    expect(formatDistance(0, 'ru')).toBe('0 m')
    expect(formatDistance(340, 'ru')).toBe('340 m')
    expect(formatDistance(999, 'uz')).toBe('999 m')
  })

  it('дальше — километры с одной десятой и разделителем языка', () => {
    expect(formatDistance(1000, 'ru')).toBe('1,0 km')
    expect(formatDistance(1240, 'ru')).toBe('1,2 km')
    expect(formatDistance(1240, 'uz')).toBe('1.2 km')
    // Потолок соседства — три километра, но округление не должно давать «3 km» из 2951.
    expect(formatDistance(2951, 'uz')).toBe('3.0 km')
  })
})

describe('formatPercent', () => {
  it('разделяет дробную часть по правилам языка', () => {
    expect(formatPercent(0.3471, 'ru')).toBe('34,7%')
    expect(formatPercent(0.3471, 'uz')).toBe('34.7%')
  })

  it('совпадает с числами счётчика: 3471 из 10 000 — это 34,7%', () => {
    // Шкала на главной заполняется этой же долей. Разъехавшись с цифрами над ней,
    // она читается как обман, поэтому пара проверяется вместе.
    expect(formatPercent(3471 / 10000, 'ru')).toBe('34,7%')
  })

  it('держит одну десятую даже там, где её не видно', () => {
    expect(formatPercent(0, 'ru')).toBe('0,0%')
    expect(formatPercent(1, 'ru')).toBe('100,0%')
    expect(formatPercent(0.5, 'uz')).toBe('50.0%')
  })

  it('округляет до десятой, а не отбрасывает', () => {
    expect(formatPercent(0.34675, 'uz')).toBe('34.7%')
    expect(formatPercent(0.00004, 'uz')).toBe('0.0%')
  })
})
