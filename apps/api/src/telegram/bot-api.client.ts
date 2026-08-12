import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/** Вызовы Bot API — прямые `fetch` (SRS §6.1). Фреймворк бота не подключается: telegraf
 *  и grammY приносят собственный роутинг, middleware и модель сессий поверх Nest, который
 *  всё это уже даёт, а выигрыш — шесть обёрток над `fetch`. Вот они. */

const DEFAULT_BASE_URL = 'https://api.telegram.org'

/** Дольше ждать бессмысленно: Telegram повторит апдейт сам, а занятое соединение
 *  в процессе с бюджетом 576 МБ дороже повторной попытки (SRS §12.1). */
const TIMEOUT_MS = 10_000

export interface InlineKeyboardButton {
  text: string
  callback_data: string
}

export interface SendMessageParams {
  chat_id: string
  text: string
  parse_mode?: 'HTML'
  reply_to_message_id?: number
  reply_markup?: { inline_keyboard: InlineKeyboardButton[][] } | { force_reply: true; selective?: true }
  link_preview_options?: { is_disabled: true }
}

export interface InputMediaPhoto {
  type: 'photo'
  media: string
  caption?: string
  parse_mode?: 'HTML'
}

/** Одна фотография с подписью и клавиатурой — в отличие от `sendMediaGroup`,
 *  который `reply_markup` не принимает вовсе. */
export interface SendPhotoParams {
  chat_id: string
  photo: string
  caption: string
  parse_mode: 'HTML'
  reply_markup: { inline_keyboard: InlineKeyboardButton[][] }
}

export interface EditCardParams {
  chat_id: string
  message_id: number
  text: string
  reply_markup: { inline_keyboard: InlineKeyboardButton[][] }
  /** Карточка из одного сообщения: текст в ней — подпись к фотографии, а не текст
   *  сообщения. */
  asCaption: boolean
}

export interface TelegramMessage {
  message_id: number
}

export interface WebhookInfo {
  url: string
  pending_update_count: number
  last_error_date?: number
  last_error_message?: string
}

/** `400` — сообщение удалено или запрос невозможен, `403` — бот выкинут из группы,
 *  `404` — чата или сообщения не существует. Всё остальное повторяется. */
const PERMANENT_STATUSES: ReadonlySet<number> = new Set([400, 403, 404])

/** Отказ Bot API, разложенный на три исхода, потому что реакция на них разная (SRS §6.7):
 *  расписание (`429`), мёртвый вызов (`4xx`) и «попробуем ещё раз» (сеть, `5xx`). */
export class BotApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Секунды из `parameters.retry_after`. Это не ошибка, а расписание: попытка
     *  не засчитывается, сдвигается только время следующей. */
    readonly retryAfter: number | null,
  ) {
    super(message)
    this.name = 'BotApiError'
  }

  /** Сообщение удалено, чат недоступен, бот выкинут из группы. Повторять нечего:
   *  бесконечно долбить заведомо мёртвый вызов бессмысленно (SRS §6.7, §6.12).
   *
   *  Список кодов, а не весь диапазон `4xx`: `401` означает неверный токен, то есть
   *  ошибку настройки, а не мёртвый вызов. Закрыв запись по нему, мы бы молча выбросили
   *  каждую карточку кампании до тех пор, пока кто-нибудь не заметит. Такое лечится
   *  правкой `.env`, и очередь обязана дождаться. */
  get permanent(): boolean {
    return this.retryAfter === null && PERMANENT_STATUSES.has(this.status)
  }
}

interface BotApiResponse<T> {
  ok: boolean
  result?: T
  description?: string
  parameters?: { retry_after?: number }
}

@Injectable()
export class BotApiClient {
  private readonly baseUrl: string
  private readonly token: string
  readonly groupChatId: string

  constructor(config: ConfigService) {
    this.token = config.getOrThrow<string>('TELEGRAM_BOT_TOKEN')
    this.groupChatId = config.getOrThrow<string>('TELEGRAM_GROUP_CHAT_ID')
    // Подменяется на заглушку в интеграционных тестах — тем же приёмом, каким SRS §11.3
    // подменяет S3. Проверяется наша граница: аргументы вызова и разбор ответа.
    this.baseUrl = (config.get<string>('TELEGRAM_API_BASE_URL') ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  }

  async call<T>(method: string, params: object): Promise<T> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      // Сеть недоступна — транзиентный отказ: 0 как статус означает «ответа не было».
      throw new BotApiError(error instanceof Error ? error.message : 'network error', 0, null)
    }

    const body = (await response.json().catch(() => ({ ok: false }))) as BotApiResponse<T>
    if (!response.ok || !body.ok) {
      const retryAfter = body.parameters?.retry_after ?? null
      throw new BotApiError(body.description ?? `HTTP ${response.status}`, response.status, retryAfter)
    }
    if (body.result === undefined) throw new BotApiError('response has no result', response.status, null)
    return body.result
  }

  sendMessage(params: SendMessageParams): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendMessage', params)
  }

  sendMediaGroup(chatId: string, media: InputMediaPhoto[]): Promise<TelegramMessage[]> {
    return this.call<TelegramMessage[]>('sendMediaGroup', { chat_id: chatId, media })
  }

  sendPhoto(params: SendPhotoParams): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendPhoto', params)
  }

  /** Правка карточки. Метод выбирается по тому, чем сообщение является: у фотографии
   *  текста нет, есть подпись, и `editMessageText` отвечает на неё «there is no text
   *  in the message to edit» — то есть `400`, который очередь считает мёртвым вызовом
   *  и закрывает запись. Признак приходит от вызывающего, потому что знает его он:
   *  объединённая карточка — это совпадение двух `message_id` заявки.
   *
   *  Превью ссылки выключено: номер заявки в тексте — ссылка на её страницу, и без
   *  этого каждая правка разворачивала бы в группе карточку сайта. */
  editCard(params: EditCardParams): Promise<unknown> {
    const { asCaption, text, ...rest } = params
    return asCaption
      ? this.call<unknown>('editMessageCaption', { ...rest, caption: text, parse_mode: 'HTML' })
      : this.call<unknown>('editMessageText', {
          ...rest,
          text,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        })
  }

  /** Вызывается **всегда**, в том числе при отказе: иначе у нажавшего крутятся «часики»
   *  до таймаута Telegram (SRS §6.11). Отказ самого вызова проглатывается — ответ
   *  на нажатие не должен ронять обработку апдейта. */
  async answerCallbackQuery(id: string, text: string, showAlert = false): Promise<void> {
    await this.call<boolean>('answerCallbackQuery', {
      callback_query_id: id,
      // Лимит Telegram — 200 символов.
      text: text.slice(0, 200),
      show_alert: showAlert,
    }).catch(() => undefined)
  }

  /** Путь к файлу в хранилище Telegram. Сами байты забирает воркер, а не webhook:
   *  скачивание в обработчике апдейта держало бы соединение и бюджет памяти. */
  async getFilePath(fileId: string): Promise<string> {
    const file = await this.call<{ file_path?: string }>('getFile', { file_id: fileId })
    if (file.file_path === undefined) throw new BotApiError('file has no path', 0, null)
    return file.file_path
  }

  fileUrl(filePath: string): string {
    return `${this.baseUrl}/file/bot${this.token}/${filePath}`
  }

  getWebhookInfo(): Promise<WebhookInfo> {
    return this.call<WebhookInfo>('getWebhookInfo', {})
  }
}
