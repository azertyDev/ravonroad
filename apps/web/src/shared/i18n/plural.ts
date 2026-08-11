import { HTML_LANG, type Locale } from './locale'

/** Формы, которые нужны обоим языкам: русскому — one/few/many (+other на дробях),
 *  узбекскому — one/other. Объединение, чтобы словарь был один на обе локали. */
export const PLURAL_FORMS = ['one', 'few', 'many', 'other'] as const

export type PluralForm = (typeof PLURAL_FORMS)[number]

const RULES: Partial<Record<Locale, Intl.PluralRules>> = {}

/** Форма слова под число.
 *
 *  `Intl.PluralRules`, а не своя проверка по последней цифре: в русском три формы,
 *  и правило ломается на 11–14 («11 районов», не «11 район»). Браузер это знает,
 *  мы — нет, и вспоминать это каждый раз вручную дороже, чем вызвать стандарт.
 *
 *  Экземпляр кэшируется: их два на всё приложение, а конструктор `Intl` не бесплатный. */
export function pluralForm(locale: Locale, count: number): PluralForm {
  RULES[locale] ??= new Intl.PluralRules(HTML_LANG[locale])
  return RULES[locale].select(count) as PluralForm
}
