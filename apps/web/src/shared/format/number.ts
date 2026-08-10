/** Разделитель разрядов — неразрывный пробел U+00A0.
 *
 *  Тонкий пробел U+2009, которым обычно разделяют разряды, в cmap IBM Plex Mono
 *  отсутствует: счётчик кампании отрисовался бы заменой глифа. Intl.NumberFormat
 *  здесь не годится по той же причине — он ставит разделитель по правилам локали,
 *  и для ru это как раз U+2009. */
const THOUSANDS_SEPARATOR = '\u00A0'

export function formatNumber(value: number): string {
  const whole = Math.trunc(value)
  const sign = whole < 0 ? '-' : ''
  return sign + Math.abs(whole).toString().replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS_SEPARATOR)
}
