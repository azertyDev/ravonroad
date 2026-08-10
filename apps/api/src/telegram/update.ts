/** Разбор входящего апдейта (SRS §6.2).
 *
 *  Тело webhook приходит из сети и до проверки не является апдейтом Telegram — им его
 *  делает только разбор. Поэтому здесь честная проверка формы, а не приведение типом:
 *  `as Update` над `JSON.parse` означал бы, что структура гарантирована отправителем,
 *  которого мы как раз и не считаем доверенным.
 *
 *  Описаны ровно те поля, которые обрабатываются: `allowed_updates` при регистрации
 *  webhook сужен до `message` и `callback_query`, и всё остальное до нас не доходит. */

export interface TelegramPhotoSize {
  file_id: string
  file_unique_id: string
  width: number
  height: number
}

export interface IncomingMessage {
  message_id: number
  from: { id: number } | null
  chat: { id: number }
  text: string | null
  photo: TelegramPhotoSize[] | null
  media_group_id: string | null
  reply_to_message: { message_id: number } | null
}

export interface IncomingCallbackQuery {
  id: string
  from: { id: number }
  data: string | null
  message: { message_id: number; chat: { id: number } } | null
}

export interface Update {
  update_id: number
  message: IncomingMessage | null
  callback_query: IncomingCallbackQuery | null
}

/** Ответ на нажатие. `alert` — модальное окно, видимое **только** нажавшему: именно так
 *  посторонний узнаёт об отказе, не засоряя группу (SRS §6.2). */
export interface CallbackAnswer {
  text: string
  alert?: boolean
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function photos(value: unknown): TelegramPhotoSize[] | null {
  if (!Array.isArray(value)) return null
  const sizes: TelegramPhotoSize[] = []
  for (const item of value) {
    const size = record(item)
    const fileId = text(size?.['file_id'])
    const uniqueId = text(size?.['file_unique_id'])
    const width = integer(size?.['width'])
    const height = integer(size?.['height'])
    if (fileId === null || uniqueId === null || width === null || height === null) continue
    sizes.push({ file_id: fileId, file_unique_id: uniqueId, width, height })
  }
  return sizes.length > 0 ? sizes : null
}

function message(value: unknown): IncomingMessage | null {
  const source = record(value)
  if (source === null) return null
  const messageId = integer(source['message_id'])
  const chatId = integer(record(source['chat'])?.['id'])
  if (messageId === null || chatId === null) return null

  const fromId = integer(record(source['from'])?.['id'])
  const replyId = integer(record(source['reply_to_message'])?.['message_id'])
  return {
    message_id: messageId,
    from: fromId === null ? null : { id: fromId },
    chat: { id: chatId },
    // Подпись к альбому лежит в `caption`, а не в `text`: для нас это один и тот же
    // текст волонтёра, и различать их дальше по коду незачем.
    text: text(source['text']) ?? text(source['caption']),
    photo: photos(source['photo']),
    media_group_id: text(source['media_group_id']),
    reply_to_message: replyId === null ? null : { message_id: replyId },
  }
}

function callbackQuery(value: unknown): IncomingCallbackQuery | null {
  const source = record(value)
  if (source === null) return null
  const id = text(source['id'])
  const fromId = integer(record(source['from'])?.['id'])
  if (id === null || fromId === null) return null

  const origin = record(source['message'])
  const messageId = integer(origin?.['message_id'])
  const chatId = integer(record(origin?.['chat'])?.['id'])
  return {
    id,
    from: { id: fromId },
    data: text(source['data']),
    message: messageId === null || chatId === null ? null : { message_id: messageId, chat: { id: chatId } },
  }
}

export function parseUpdate(body: unknown): Update | null {
  const source = record(body)
  const updateId = integer(source?.['update_id'])
  if (source === null || updateId === null) return null
  return {
    update_id: updateId,
    message: message(source['message']),
    callback_query: callbackQuery(source['callback_query']),
  }
}
