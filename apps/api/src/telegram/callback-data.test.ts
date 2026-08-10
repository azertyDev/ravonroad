import { describe, expect, it } from 'vitest'
import {
  CALLBACK_DATA_MAX_BYTES,
  CALLBACK_OPS,
  encodeCallbackData,
  parseCallbackData,
} from './callback-data'

describe('callback data', () => {
  it('переживает кодирование и разбор для каждой операции', () => {
    for (const op of CALLBACK_OPS) {
      const data = { op, n: 3471, arg: 'not_road_defect' }
      expect(parseCallbackData(encodeCallbackData(data))).toEqual(data)
    }
  })

  it('кодирует и без аргумента', () => {
    expect(encodeCallbackData({ op: 'u', n: 12 })).toBe('1:u:12')
    expect(parseCallbackData('1:u:12')).toEqual({ op: 'u', n: 12 })
  })

  // Лимит Telegram. Самая длинная строка, которую мы способны собрать, — причина
  // «не по силам» с кодом из глоссария у шестизначного номера.
  it('укладывается в лимит на самой длинной реальной кнопке', () => {
    const longest = encodeCallbackData({ op: 'O', n: 999_999, arg: 'ground_sinkhole' })
    expect(Buffer.byteLength(longest)).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES)
  })

  it('отказывается кодировать то, что не поместится в кнопку', () => {
    expect(() => encodeCallbackData({ op: 'R', n: 3471, arg: 'x'.repeat(64) })).toThrow(/64 bytes/)
  })

  it('отклоняет мусор, чужую версию и лишние поля без исключения', () => {
    const rejected = [
      undefined,
      null,
      '',
      'нажми меня',
      '2:s:3471:AC', // версия схемы из будущего
      '1:x:3471', // неизвестная операция
      '1:s:0', // номеров с нуля не бывает
      '1:s:-3471',
      '1:s:34a71',
      '1:s', // полей меньше трёх
      '1:s:3471:AC:extra',
      `1:s:3471:${'x'.repeat(80)}`, // длиннее лимита кнопки
      '1:R:3471:код;drop', // аргумент вне алфавита
    ]
    for (const raw of rejected) expect(parseCallbackData(raw)).toBeNull()
  })
})
