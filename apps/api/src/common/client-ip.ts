import type { IncomingMessage } from 'node:http'

/** Адрес отправителя для антиабуза (SRS §9.5). Наружу смотрит nginx, поэтому
 *  `socket.remoteAddress` — это всегда адрес edge; настоящий приходит в заголовке,
 *  который ставит он же.
 *
 *  Берётся **первый** элемент списка: последующие дописывают промежуточные прокси,
 *  и доверять им нельзя. Первый тоже подделывается кем угодно, но подделка адреса
 *  здесь означает лишь обход мягкого флага, а не доступ к чужим данным. */
export function clientIp(request: IncomingMessage): string | null {
  const forwarded = request.headers['x-forwarded-for']
  const header = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const first = header?.split(',')[0]?.trim()
  if (first !== undefined && first !== '') return first
  return request.socket.remoteAddress ?? null
}
