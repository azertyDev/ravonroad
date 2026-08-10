import { DEFAULT_LOCALE, type Locale } from '@ravonroad/shared-types'

/** Локаль — сегмент пути, а не cookie и не заголовок: сайт статический, серверного
 *  рендера нет, и Accept-Language коду недоступен (SRS §7.2). Сам список объявлен
 *  в контракте: его читает и сервер, когда собирает `trackingPath` (ADR-0006). */
export { DEFAULT_LOCALE, isLocale, LOCALES, type Locale } from '@ravonroad/shared-types'

/** Значение для <html lang> и hreflang — не то же самое, что сегмент URL. У `uz`
 *  в реестре IANA нет Suppress-Script, то есть язык сам по себе не говорит о
 *  письменности, и синтезатор речи вправе прочитать нашу латиницу кириллическими
 *  правилами. Сегмент пути остаётся коротким: адрес читают люди. */
export const HTML_LANG: Record<Locale, string> = { uz: 'uz-Latn', ru: 'ru' }

/** Первый язык браузера, начинающийся с ru, даёт ru; всё остальное, включая
 *  отсутствие данных, — uz (SRS §7.2). */
export function detectLocale(languages: readonly string[] | undefined): Locale {
  const first = languages?.[0]
  return first !== undefined && first.toLowerCase().startsWith('ru') ? 'ru' : DEFAULT_LOCALE
}
