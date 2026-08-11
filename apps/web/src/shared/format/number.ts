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
