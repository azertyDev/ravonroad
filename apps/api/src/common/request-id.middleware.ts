import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { runWithCorrelationId } from './correlation'

/** Correlation id по SRS §8.3: 26 символов, монотонный по времени.
 *  Алфавит Крокфорда — без I, L, O и U, чтобы идентификатор из тикета нельзя было
 *  прочитать двояко. 10 символов времени в миллисекундах + 16 символов случайности. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const TIME_LENGTH = 10
const RANDOM_LENGTH = 16
const REQUEST_ID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

function encodeTime(epochMs: number): string {
  let rest = epochMs
  let encoded = ''
  for (let i = 0; i < TIME_LENGTH; i += 1) {
    encoded = ALPHABET.charAt(rest % ALPHABET.length) + encoded
    rest = Math.floor(rest / ALPHABET.length)
  }
  return encoded
}

export function generateRequestId(epochMs: number = Date.now()): string {
  const bytes = randomBytes(RANDOM_LENGTH)
  let random = ''
  for (const byte of bytes) random += ALPHABET.charAt(byte % ALPHABET.length)
  return encodeTime(epochMs) + random
}

/** Заголовок приходит снаружи и попадает в логи и в тело ошибки, поэтому принимается
 *  только точная форма идентификатора: иначе чужая строка испортила бы журнал. */
export function normalizeRequestId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header
  return value !== undefined && REQUEST_ID_PATTERN.test(value) ? value : generateRequestId()
}

export function requestIdMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const requestId = normalizeRequestId(req.headers['x-request-id'])
  req.headers['x-request-id'] = requestId
  res.setHeader('X-Request-Id', requestId)
  // Дальше идёт вся обработка запроса, поэтому идентификатор виден любой строке лога
  // на её пути — без лишнего аргумента у каждой функции (SRS §8.3).
  runWithCorrelationId(requestId, next)
}
