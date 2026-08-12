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

/** Сколько дней бригада чинила яму: подпись «4 kunda» под последней закрытой заявкой
 *  (Desktop C › правая колонка). Меньше суток — это всё равно день, а не ноль: «0 kunda»
 *  читается как отсутствующее число, а не как «за пару часов». Разница берётся по меткам
 *  времени, а не по календарным датам: заявка, закрытая в полночь, чинилась не два дня. */
export function repairDays(createdAt: string, doneAt: string): number {
  const ms = Date.parse(doneAt) - Date.parse(createdAt)
  return Math.max(1, Math.round(ms / 86_400_000))
}

/** История переходов показывается с временем: инвариант PRD 5.3.4 требует статус,
 *  дату и время, а два перехода за один день без времени слиплись бы. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return `${formatDate(iso)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
