import { currentCorrelationId } from './correlation'

/** Структурный лог (SRS §8.4): JSON в stdout, один объект на строку, `msg` — событие
 *  в snake_case, а не предложение. Забирает `docker logs` с ограничением драйвера.
 *
 *  Запретный список §8.4 держится двумя рубежами, и ни один из них не чек-лист ревью:
 *
 *  1. `LogFields` — **закрытый** набор полей. `trackingToken`, телефон, ник заявителя
 *     и полный адрес сюда не добавляются, поэтому попытка их записать падает
 *     на `pnpm typecheck`, а не на глазах ревьюера.
 *  2. `redact` — сеть под свободным текстом. Единственное, что приходит в лог не из
 *     нашего словаря, — это `error` и `reason` от внешних систем, и там может оказаться
 *     всё что угодно, включая адрес отправителя и номер телефона.
 *
 *  Пути запроса здесь не пишутся: `/api/track/<token>` — это и есть `tracking_token`
 *  в логе. Маршруты пишет nginx, и токен он маскирует у себя (docker/edge/nginx.conf). */

export type LogLevel = 'error' | 'warn' | 'info'

export interface LogFields {
  /** Роль correlation id для апдейтов Telegram играет `update_id` (SRS §8.3); поле
   *  остаётся рядом, чтобы апдейт был виден и в событиях, поднятых из воркера. */
  updateId?: number
  reportId?: number
  moderatorId?: number
  telegramUserId?: number
  outboxId?: number
  batchId?: number
  /** Маршрут-константа (`POST /api/reports`), а не `request.url`: в адресе живёт токен. */
  route?: string
  /** Статус заявки строкой, код ответа числом — одно поле, потому что в логе они
   *  читаются одинаково и никогда не встречаются в одном событии. */
  status?: string | number
  durMs?: number
  from?: string
  to?: string
  district?: string | null
  /** Только `/24` (SRS §8.4). Считает `ipPrefix()`, полного адреса поля нет вовсе. */
  ipPrefix?: string
  rule?: string
  reason?: string
  error?: string
  count?: number
  /** Четыре числа события `queue_depth` (SRS §10.3). */
  photoQueue?: number
  deliveryQueue?: number
  moderationQueue?: number
  photoFailed?: number
  /** Условие алерта (SRS §10.4) и его состояние. */
  condition?: string
  deduped?: boolean
}

/** Полный адрес в логах запрещён, а сеть /24 остаётся полезной: по ней видно, что
 *  всплеск идёт из одного места, и при этом не видно, из какой квартиры (SRS §8.4, §9.5). */
export function ipPrefix(ip: string | null): string | undefined {
  if (ip === null) return undefined
  const octets = ip.split('.')
  if (octets.length !== 4) return undefined
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`
}

/** Адрес IPv4 целиком — до /24; телефон в международной форме — до заглушки.
 *  Обе замены работают по свободному тексту от внешних систем, а не по нашим полям. */
const FULL_IPV4 = /\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g
const PHONE = /\+\d{9,15}\b/g

function redact(value: string): string {
  return value.replace(FULL_IPV4, '$1.0/24').replace(PHONE, '+***')
}

export function logEvent(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const safe: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined) continue
    safe[name] = typeof value === 'string' ? redact(value) : value
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    correlationId: currentCorrelationId() ?? null,
    ...safe,
  })
  if (level === 'error') console.error(line)
  else console.log(line)
}
