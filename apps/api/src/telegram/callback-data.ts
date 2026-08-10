/** Кодек `callback_data` (SRS §6.4).
 *
 *  Формат — `1:<op>:<n>:<arg>`, где `1` версия схемы. Версия нужна не «на будущее»,
 *  а потому что кнопки живут в истории группы вечно: сообщение месячной давности
 *  остаётся нажимаемым, и после изменения формата его `callback_data` обязана быть
 *  отвергнута явно, а не разобрана как что-то другое.
 *
 *  Номер заявки здесь — идентификатор, а не право: сервер всё равно сверяет нажавшего
 *  с allowlist (SRS §6.2), поэтому подделанная строка не доходит до записи. */

export const CALLBACK_VERSION = '1'

/** Лимит Telegram — 64 байта. Проверяется на кодировании: строка длиннее просто
 *  не отправится, и узнать об этом на своём тесте дешевле, чем на кнопке в группе. */
export const CALLBACK_DATA_MAX_BYTES = 64

/** Операции. Буква — это и есть протокол; расшифровка живёт здесь, а обработчики
 *  переключаются по ней одним `switch`.
 *
 *  | op | что делает                      | `n`         |
 *  |----|---------------------------------|-------------|
 *  | s  | одношаговый переход             | номер       |
 *  | r  | показать причины отклонения     | номер       |
 *  | o  | показать причины «не по силам»  | номер       |
 *  | R  | выбрана причина отклонения      | номер       |
 *  | O  | выбрана причина «не по силам»   | номер       |
 *  | z  | вернуться к кнопкам статусов    | номер       |
 *  | d  | запросить номер оригинала       | номер       |
 *  | u  | отменить переход                | id истории  |
 *  | B  | применить действие к пакету     | id пакета   |
 *  | b  | раскрыть пакет                  | id пакета   |
 *  | U  | отменить пакет целиком          | id пакета   | */
export const CALLBACK_OPS = ['s', 'r', 'o', 'R', 'O', 'z', 'd', 'u', 'B', 'b', 'U'] as const

export type CallbackOp = (typeof CALLBACK_OPS)[number]

export interface CallbackData {
  op: CallbackOp
  /** `public_number` заявки, `id` записи истории или `id` пакета — смотря какая операция. */
  n: number
  arg?: string
}

/** Аргумент — только то, что мы сами кладём: коды статусов, коды причин, буквы действий
 *  пакета. Всё остальное — мусор или чужая версия. */
const ARGUMENT = /^[A-Za-z0-9_-]{1,32}$/

const OPS: ReadonlySet<string> = new Set(CALLBACK_OPS)

export function encodeCallbackData(data: CallbackData): string {
  const encoded =
    data.arg === undefined
      ? `${CALLBACK_VERSION}:${data.op}:${data.n}`
      : `${CALLBACK_VERSION}:${data.op}:${data.n}:${data.arg}`
  if (Buffer.byteLength(encoded) > CALLBACK_DATA_MAX_BYTES) {
    throw new Error(`callback_data ${encoded} exceeds ${CALLBACK_DATA_MAX_BYTES} bytes`)
  }
  return encoded
}

/** `null` на всём, что не наше: мусор, чужая версия схемы, отрицательный номер,
 *  слишком длинная строка. Исключения здесь не бросаются намеренно — нажатие старой
 *  кнопки это обычное событие, а не сбой, и отвечать на него нужно alert-ом, а не 500
 *  (SRS §6.11). */
export function parseCallbackData(raw: string | undefined | null): CallbackData | null {
  if (typeof raw !== 'string') return null
  if (Buffer.byteLength(raw) > CALLBACK_DATA_MAX_BYTES) return null

  const parts = raw.split(':')
  if (parts.length < 3 || parts.length > 4) return null

  const [version, op, rawNumber, arg] = parts
  if (version !== CALLBACK_VERSION) return null
  if (op === undefined || !OPS.has(op)) return null
  if (rawNumber === undefined || !/^[1-9][0-9]{0,9}$/.test(rawNumber)) return null
  if (arg !== undefined && !ARGUMENT.test(arg)) return null

  const data: CallbackData = { op: op as CallbackOp, n: Number(rawNumber) }
  if (arg !== undefined) data.arg = arg
  return data
}
