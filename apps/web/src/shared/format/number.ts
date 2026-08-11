import type { Locale } from '../i18n/locale'

/** Разделитель разрядов — тонкий пробел U+2009, как требует дизайн-система.
 *
 *  Раньше здесь стоял неразрывный U+00A0: в cmap IBM Plex Mono тонкого пробела не было
 *  вовсе, и счётчик кампании отрисовался бы заменой глифа. С переходом на Inter
 *  ограничение снято — наличие U+2009 проверено разбором cmap скачанных woff2, а не по
 *  объявленному unicode-range: именно там он у Plex и был заявлен при отсутствующем глифе.
 *
 *  Intl.NumberFormat по-прежнему не годится: он ставит разделитель по правилам локали,
 *  а число обязано выглядеть одинаково на обоих языках сайта. */
const THOUSANDS_SEPARATOR = ' '

export function formatNumber(value: number): string {
  const whole = Math.trunc(value)
  const sign = whole < 0 ? '-' : ''
  return sign + Math.abs(whole).toString().replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR)
}

/** Десятичный разделитель, в отличие от разделителя разрядов, у языков разный:
 *  запятая в русском, точка в узбекской латинице (дизайн-система › Content fundamentals).
 *  Доля кампании — единственное число на сайте, которое зависит от локали. */
const DECIMAL_SEPARATOR: Record<Locale, string> = { uz: '.', ru: ',' }

/** Доля выполнения кампании, одна десятая процента: 3471 из 10 000 → «34,7%».
 *  Шкала под цифрами заполняется из этого же значения: разойдясь с цифрами, она читается
 *  как обман, а это главный числовой блок сайта. */
export function formatPercent(share: number, locale: Locale): string {
  return `${(Math.round(share * 1000) / 10).toFixed(1).replace('.', DECIMAL_SEPARATOR[locale])}%`
}
