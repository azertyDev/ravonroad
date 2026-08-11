import {
  OUT_OF_SCOPE_REASON_CODES,
  REJECT_REASON_CODES,
  REPORT_STATUSES,
} from '@ravonroad/shared-types'
import { describe, expect, it } from 'vitest'
import { LOCALES, type Locale } from './locale'
import { MESSAGES } from './messages'

/** Ключи доменных кодов собираются из контракта, а не переписываются: список,
 *  набранный руками, разошёлся бы с машиной состояний ровно тогда, когда в неё
 *  добавили причину (SRS §8.2). */
const DOMAIN_KEYS = [
  ...REPORT_STATUSES.map((status) => `status.${status}`),
  ...[...REJECT_REASON_CODES, ...OUT_OF_SCOPE_REASON_CODES].map((code) => `reason.${code}`),
]

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

  it('переводят каждый доменный код контракта (US-015, AC-2)', () => {
    // Дублирует проверку типа из messages.ts намеренно: тип ловит забытый ключ
    // при сборке, а тест — ещё и пустую строку на его месте.
    for (const locale of LOCALES) {
      const ui: Record<string, string | undefined> = MESSAGES[locale].ui
      for (const key of DOMAIN_KEYS) expect(ui[key]?.trim()).not.toBe('')
      expect(DOMAIN_KEYS.filter((key) => ui[key] === undefined)).toEqual([])
    }
  })

  it('дают каждому статусу свою подпись: одинаковые неразличимы в монохроме (AC-8)', () => {
    for (const locale of LOCALES) {
      const ui: Record<string, string> = MESSAGES[locale].ui
      const labels = REPORT_STATUSES.map((status) => ui[`status.${status}`])
      expect(new Set(labels).size).toBe(REPORT_STATUSES.length)
    }
  })

  it('не содержат ключей категорий: их переводы живут в БД (SRS §2.5, AC-4)', () => {
    // Категория добавляется INSERT-ом, без передеплоя фронта. Строка в словаре
    // означала бы, что новая категория показывается кодом до следующей сборки.
    for (const locale of LOCALES) {
      const suspicious = Object.keys(MESSAGES[locale].ui).filter((key) =>
        /^categor(y|ies)\./.test(key),
      )
      expect(suspicious).toEqual([])
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
