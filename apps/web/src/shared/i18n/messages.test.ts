import { describe, expect, it } from 'vitest'
import { LOCALES, type Locale } from './locale'
import { MESSAGES } from './messages'

const [reference, ...rest] = LOCALES

/** Проверки словаря идут по всем группам сообщений: житель одинаково видит и подпись
 *  кнопки, и текст ошибки, и делить их по строгости незачем. */
function allValues(locale: Locale): string[] {
  return [...Object.values(MESSAGES[locale].ui), ...Object.values(MESSAGES[locale].error)]
}

describe('словари локалей', () => {
  it('покрывают все объявленные локали', () => {
    expect(Object.keys(MESSAGES).sort()).toEqual([...LOCALES].sort())
  })

  it('имеют одинаковые множества ключей интерфейса (SRS §11.2)', () => {
    const expected = Object.keys(MESSAGES[reference].ui).sort()
    for (const locale of rest) {
      expect(Object.keys(MESSAGES[locale].ui).sort()).toEqual(expected)
    }
  })

  it('имеют одинаковые множества кодов ошибок', () => {
    const expected = Object.keys(MESSAGES[reference].error).sort()
    for (const locale of rest) {
      expect(Object.keys(MESSAGES[locale].error).sort()).toEqual(expected)
    }
  })

  it('не содержат пустых строк', () => {
    for (const locale of LOCALES) {
      for (const value of allValues(locale)) {
        expect(value.trim()).not.toBe('')
      }
    }
  })

  it('пишет узбекскую латиницу модификаторными буквами, а не ASCII-апострофом', () => {
    for (const value of allValues('uz')) {
      expect(value).not.toMatch(/['\u2018\u2019]/)
    }
  })
})
