/** Локаль — сегмент пути (SRS §7.2). Список объявлен здесь, а не только во фронте,
 *  потому что сервер собирает `trackingPath` вида `/uz/z/<token>` и обязан знать,
 *  какие сегменты существуют: значение приходит от клиента и проверяется (SRS §9.7). */
export const LOCALES = ['uz', 'ru'] as const

export type Locale = (typeof LOCALES)[number]

/** Узбекская — по умолчанию (PRD US-015). */
export const DEFAULT_LOCALE: Locale = 'uz'

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value)
}
