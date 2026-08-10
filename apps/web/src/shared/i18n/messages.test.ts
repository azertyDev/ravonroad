import { describe, expect, it } from 'vitest'
import { LOCALES, type Locale } from './locale'
import { MESSAGES } from './messages'

const [reference, ...rest] = LOCALES

/** Узбекская латиница ставит модификаторные буквы ʻ (U+02BB) и ʼ (U+02BC).
 *  ASCII-кавычка и типографские на их месте — ошибка набора: у них другая семантика,
 *  и синтезатор речи спотыкается о них как о пунктуации. */
const WRONG_APOSTROPHE = /['\u2018\u2019]/
const MODIFIER_LETTER = /[\u02BB\u02BC]/

/** Контрольная строка — район Ташкента, как он записан в глоссарии. Она нужна,
 *  чтобы проверка доказала свою работоспособность на заведомо верном образце. */
const CONTROL = 'Mirzo Ulug\u02BBbek tumani'

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

  it('ловит ASCII-апостроф на месте модификаторной буквы', () => {
    // Без этого правило проходило бы и на «Ozbekcha»: отсутствие неверного символа
    // само по себе не означает, что верный на месте.
    expect(CONTROL).toMatch(MODIFIER_LETTER)
    expect(CONTROL).not.toMatch(WRONG_APOSTROPHE)
    expect(CONTROL.replace(MODIFIER_LETTER, "'")).toMatch(WRONG_APOSTROPHE)
  })

  it('пишут узбекскую латиницу модификаторными буквами, а не ASCII-апострофом', () => {
    // Обе локали: «Oʻzbekcha» стоит и в ru.ts — узбекское слово не перестаёт
    // быть узбекским оттого, что лежит в русском словаре.
    for (const locale of LOCALES) {
      for (const value of allValues(locale)) {
        expect(value).not.toMatch(WRONG_APOSTROPHE)
      }
    }
  })
})
