/** Структурный лог (SRS §8.4): JSON в stdout, один объект на строку, `msg` —
 *  событие в snake_case, а не предложение.
 *
 *  Роль correlation id для апдейтов Telegram играет `update_id`, `reportId` пишется
 *  рядом (SRS §8.3). Чего здесь нет никогда: `tracking_token`, телефон и ник заявителя,
 *  токен бота, содержимое фотографий. */

export type LogLevel = 'error' | 'warn' | 'info'

export interface LogFields {
  updateId?: number
  reportId?: number
  moderatorId?: number
  telegramUserId?: number
  outboxId?: number
  batchId?: number
  status?: string
  from?: string
  to?: string
  error?: string
  depth?: number
  count?: number
  reason?: string
}

export function logEvent(level: LogLevel, msg: string, fields: LogFields = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields })
  if (level === 'error') console.error(line)
  else console.log(line)
}
