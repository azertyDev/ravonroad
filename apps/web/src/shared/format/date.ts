/** Даты в интерфейсе — числами и в часовом поясе устройства.
 *
 *  `Intl.DateTimeFormat` здесь не нужен: `ru` и `uz-Latn` пишут дату одинаково,
 *  `dd.MM.yyyy`, и словесных месяцев на страницах нет. Зато ICU в разных браузерах
 *  расставляет разделители по-своему, и проверить формат тестом было бы нечем.
 *  Пояс берётся у устройства: житель смотрит на заявку из Ташкента, а сервер хранит UTC. */
function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`
}

/** История переходов показывается с временем: инвариант PRD 5.3.4 требует статус,
 *  дату и время, а два перехода за один день без времени слиплись бы. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return `${formatDate(iso)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
