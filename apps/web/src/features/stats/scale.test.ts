import { describe, expect, it } from 'vitest'
import { formatPercent } from '../../shared/format/number'
import { campaignScale } from './scale'

const THIN_SPACE = ' '
const NBSP = ' '

/** Цифры счётчика и заливка шкалы под ними обязаны идти от одного числа. Разъехавшись,
 *  шкала не падает — она врёт, и заметить это можно только глазами. Поэтому пара
 *  проверяется вместе, а не по отдельности. */
describe('campaignScale', () => {
  it('заполняет шкалу из той же доли, что показывает подпись', () => {
    const { share, right } = campaignScale(3471, 10000)

    expect(formatPercent(share, 'ru')).toBe('34,7%')
    expect(formatPercent(share, 'uz')).toBe('34.7%')
    // 34,7% — это правый отступ 65,3%, а не ширина 34,7%.
    expect(right).toBe('65.3%')
  })

  it('зажимает долю по краям', () => {
    expect(campaignScale(0, 10000).right).toBe('100%')
    // Перевыполненная кампания рисует полную шкалу, а не вылезает за неё.
    expect(campaignScale(12000, 10000).right).toBe('0%')
    expect(campaignScale(12000, 10000).share).toBe(1)
  })

  it('не делит на ноль, если цель придёт пустой', () => {
    expect(campaignScale(7, 0)).toMatchObject({ share: 0, right: '100%' })
  })

  it('набирает одометр из того же числа, что читает скринридер', () => {
    const done = 3471
    const { digits } = campaignScale(done, 10000)

    expect(digits).toEqual(['3', '4', '7', '1'])
    // Ячейки одометра — то же число, что и строка рядом с ним, только по разрядам.
    expect(digits.join('')).toBe(String(done))
  })

  it('делит разряды тонким пробелом, а не неразрывным', () => {
    // U+00A0 стоял здесь, пока гарнитурой была IBM Plex Mono без глифа U+2009.
    // Одометр выбрасывает разделитель, поэтому проверяется источник цифр.
    const formatted = campaignScale(3471, 10000).digits.join('')
    expect(formatted).not.toContain(THIN_SPACE)
    expect(formatted).not.toContain(NBSP)
    expect(campaignScale(10000, 10000).digits).toEqual(['1', '0', '0', '0', '0'])
  })
})
