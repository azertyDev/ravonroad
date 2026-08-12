import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { ConfigService } from '@nestjs/config'
import { S3Service } from '../../src/media/s3.service'
import type { PrismaService } from '../../src/prisma/prisma.service'
import { UndoService } from '../../src/reports/undo.service'
import { BotApiClient } from '../../src/telegram/bot-api.client'
import { CardRenderer } from '../../src/telegram/card.renderer'
import { DigestService } from '../../src/telegram/digest.service'
import { DuplicatesService } from '../../src/telegram/duplicates.service'
import { OutboxWorker } from '../../src/telegram/outbox.worker'

/** Заглушка Bot API — тем же приёмом, каким `storage.ts` заменяет S3 (SRS §11.3).
 *  Проверяется наша граница: какие вызовы уходят, с какими аргументами и как мы
 *  разбираем ответ. Работоспособность самого Telegram — не наш код. */

export const BOT_TOKEN = 'test-bot-token'
export const GROUP_CHAT_ID = '-1001234567890'
export const WEBHOOK_SECRET = 'test-webhook-secret'
export const WEBHOOK_PATH = 'test-webhook-path'

export interface RecordedCall {
  method: string
  params: Record<string, unknown>
}

export type FakeMode = 'ok' | 'down' | 'rate-limited' | 'gone'

export interface FakeTelegram {
  baseUrl: string
  calls: RecordedCall[]
  /** Байты, которые отдаются на скачивание файла (фотографии «после»). */
  file: Buffer
  mode: FakeMode
  retryAfter: number
  /** Что отвечает `getWebhookInfo` (SRS §10.4): активная проверка спрашивает именно его. */
  webhookUrl: string
  pendingUpdates: number
  close: () => Promise<void>
  /** Вызовы одного метода — самая частая выборка в проверках. */
  of: (method: string) => RecordedCall[]
  reset: () => void
}

export async function startFakeTelegram(): Promise<FakeTelegram> {
  const calls: RecordedCall[] = []
  const state = {
    mode: 'ok' as FakeMode,
    retryAfter: 30,
    messageId: 100,
    file: Buffer.from('jpeg-bytes'),
    webhookUrl: 'https://example.test/webhook',
    pendingUpdates: 0,
  }

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const url = request.url ?? ''
      // Скачивание файла: GET /file/bot<token>/<path>
      if (url.startsWith(`/file/bot${BOT_TOKEN}/`)) {
        response.writeHead(200, { 'content-type': 'image/jpeg' }).end(state.file)
        return
      }

      const method = url.slice(url.lastIndexOf('/') + 1)
      const raw = Buffer.concat(chunks).toString('utf8')
      const params = (raw === '' ? {} : JSON.parse(raw)) as Record<string, unknown>
      calls.push({ method, params })

      if (state.mode === 'down') {
        response.writeHead(502, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: false, description: 'Bad Gateway' }))
        return
      }
      if (state.mode === 'rate-limited') {
        response.writeHead(429, { 'content-type': 'application/json' })
        response.end(
          JSON.stringify({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests',
            parameters: { retry_after: state.retryAfter },
          }),
        )
        return
      }
      if (state.mode === 'gone') {
        response.writeHead(400, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ok: false, description: 'Bad Request: chat not found' }))
        return
      }

      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, result: resultFor(method, state) }))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    calls,
    get file() {
      return state.file
    },
    set file(value: Buffer) {
      state.file = value
    },
    get mode() {
      return state.mode
    },
    set mode(value: FakeMode) {
      state.mode = value
    },
    get retryAfter() {
      return state.retryAfter
    },
    set retryAfter(value: number) {
      state.retryAfter = value
    },
    get webhookUrl() {
      return state.webhookUrl
    },
    set webhookUrl(value: string) {
      state.webhookUrl = value
    },
    get pendingUpdates() {
      return state.pendingUpdates
    },
    set pendingUpdates(value: number) {
      state.pendingUpdates = value
    },
    of: (method: string) => calls.filter((call) => call.method === method),
    reset: () => {
      calls.length = 0
      state.mode = 'ok'
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

function resultFor(method: string, state: { messageId: number; webhookUrl: string; pendingUpdates: number }): unknown {
  switch (method) {
    case 'sendMessage':
      state.messageId += 1
      return { message_id: state.messageId }
    case 'sendMediaGroup':
      state.messageId += 1
      return [{ message_id: state.messageId }]
    case 'sendPhoto':
      state.messageId += 1
      return { message_id: state.messageId }
    case 'getFile':
      return { file_path: 'photos/file_1.jpg' }
    case 'getWebhookInfo':
      return { url: state.webhookUrl, pending_update_count: state.pendingUpdates }
    default:
      return true
  }
}

/** Ставится **до** сборки приложения: `BotApiClient` читает конфигурацию в конструкторе,
 *  как и клиент S3. */
export function applyTelegramEnv(telegram: FakeTelegram): void {
  process.env['TELEGRAM_BOT_TOKEN'] = BOT_TOKEN
  process.env['TELEGRAM_GROUP_CHAT_ID'] = GROUP_CHAT_ID
  process.env['TELEGRAM_WEBHOOK_SECRET'] = WEBHOOK_SECRET
  process.env['TELEGRAM_WEBHOOK_PATH'] = WEBHOOK_PATH
  process.env['TELEGRAM_API_BASE_URL'] = telegram.baseUrl
  // Засев allowlist проверяется отдельно и не должен подмешивать модераторов
  // в остальные тесты.
  process.env['TELEGRAM_MODERATOR_IDS'] = ''
}

/** `truncateData` чистит только таблицы 002. Таблицы бота либо не связаны с `report`
 *  внешним ключом (`moderator`, `processed_update`, `moderation_batch`), либо чистятся
 *  каскадом — но полагаться на каскад для чужого файла не стоит. */
export async function resetTelegramTables(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE telegram_outbox, processed_update, bot_prompt, moderation_batch, moderator RESTART IDENTITY CASCADE',
  )
}

/** Воркер собирается руками, а не берётся из приложения: тест гоняет его шагами.
 *  Ждать десятисекундного таймера значило бы мерить сон, а не поведение очереди —
 *  тот же приём, что в `photo-worker.spec.ts`. */
export function buildOutboxWorker(prisma: PrismaService): OutboxWorker {
  const config = new ConfigService()
  const cards = new CardRenderer(prisma, new S3Service(config), new UndoService(), config)
  return new OutboxWorker(prisma, new BotApiClient(config), cards, new DigestService(config), new DuplicatesService())
}

export interface SeededReport {
  id: number
  publicNumber: number
}

/** Заявка создаётся прямо в БД: проверяется поведение бота, а не приём формы —
 *  он покрыт `reports.spec.ts`. Карточка считается уже отправленной, если заданы
 *  идентификаторы сообщений: именно по ним волонтёр отвечает фотографиями. */
export async function seedReport(
  prisma: PrismaService,
  options: {
    status?: 'NEW' | 'ACCEPTED' | 'IN_PROGRESS' | 'DONE' | 'REJECTED' | 'DUPLICATE' | 'OUT_OF_SCOPE'
    albumMessageId?: number
    cardMessageId?: number
    landmark?: string
    latitude?: string
    longitude?: string
    duplicateCandidateOfId?: number
    /** Обработанных фотографий «до». Их число решает форму карточки: одна — одно
     *  сообщение, две и три — альбом плюс сообщение с кнопками. */
    readyPhotos?: number
    withAfterPhoto?: boolean
  } = {},
): Promise<SeededReport> {
  const category = await prisma.category.findFirstOrThrow({ select: { id: true } })
  const status = options.status ?? 'NEW'
  const report = await prisma.report.create({
    data: {
      categoryId: category.id,
      districtCode: 'chilonzor',
      latitude: options.latitude ?? '41.275512',
      longitude: options.longitude ?? '69.204411',
      landmark: options.landmark ?? 'напротив дома 12',
      trackingToken: `tkn${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36).slice(-6)}`,
      status,
      doneAt: status === 'DONE' ? new Date() : null,
      statusReason: status === 'REJECTED' || status === 'OUT_OF_SCOPE' ? 'spam' : null,
      telegramAlbumMessageId: options.albumMessageId ?? null,
      telegramCardMessageId: options.cardMessageId ?? null,
      duplicateCandidateOfId: options.duplicateCandidateOfId ?? null,
      history: { create: [{ fromStatus: null, toStatus: 'NEW', actorType: 'SYSTEM' }] },
    },
    select: { id: true, publicNumber: true },
  })

  for (let index = 0; index < (options.readyPhotos ?? 0); index += 1) {
    // sha256 разный: у пары «заявка + вид» он уникален (`photo_dedup_idx`).
    const hash = `${index}`.repeat(2).padEnd(64, 'a')
    await prisma.reportPhoto.create({
      data: {
        reportId: report.id,
        kind: 'BEFORE',
        sortOrder: index,
        state: 'READY',
        objectKey: `photos/aa/${hash}.jpg`,
        previewKey: `photos/aa/${hash}_400.jpg`,
        sha256: hash,
      },
    })
  }
  if (options.withAfterPhoto === true) {
    await prisma.reportPhoto.create({
      data: { reportId: report.id, kind: 'AFTER', sortOrder: 0, state: 'PENDING', rawKey: 'incoming/after' },
    })
  }
  return report
}

export async function seedModerator(prisma: PrismaService, telegramUserId: number, name = 'Модератор'): Promise<number> {
  const moderator = await prisma.moderator.create({
    data: { telegramUserId: BigInt(telegramUserId), displayName: name },
    select: { id: true },
  })
  return moderator.id
}

let nextUpdateId = 5000

/** Апдейт в том виде, в каком его шлёт Telegram: обработчик обязан разбирать именно
 *  такое тело, а не наш внутренний тип. */
export function callbackUpdate(input: {
  data: string
  fromId: number
  messageId?: number
  updateId?: number
}): Record<string, unknown> {
  nextUpdateId += 1
  return {
    update_id: input.updateId ?? nextUpdateId,
    callback_query: {
      id: `cb-${nextUpdateId}`,
      from: { id: input.fromId, is_bot: false, first_name: 'Tester' },
      message: {
        message_id: input.messageId ?? 1,
        chat: { id: Number(GROUP_CHAT_ID), type: 'supergroup' },
        date: 1,
      },
      chat_instance: 'instance',
      data: input.data,
    },
  }
}

export function messageUpdate(input: {
  fromId: number
  text?: string
  photo?: boolean
  mediaGroupId?: string
  replyToMessageId?: number
  updateId?: number
  chatId?: number
}): Record<string, unknown> {
  nextUpdateId += 1
  const message: Record<string, unknown> = {
    message_id: nextUpdateId,
    from: { id: input.fromId, is_bot: false, first_name: 'Volunteer' },
    chat: { id: input.chatId ?? Number(GROUP_CHAT_ID), type: 'supergroup' },
    date: 1,
  }
  if (input.text !== undefined) message['text'] = input.text
  if (input.photo === true) {
    message['photo'] = [
      { file_id: `file-${nextUpdateId}-small`, file_unique_id: `u-${nextUpdateId}-s`, width: 90, height: 60 },
      { file_id: `file-${nextUpdateId}`, file_unique_id: `u-${nextUpdateId}`, width: 1280, height: 960 },
    ]
  }
  if (input.mediaGroupId !== undefined) message['media_group_id'] = input.mediaGroupId
  if (input.replyToMessageId !== undefined) {
    message['reply_to_message'] = {
      message_id: input.replyToMessageId,
      chat: { id: input.chatId ?? Number(GROUP_CHAT_ID), type: 'supergroup' },
      date: 1,
    }
  }
  return { update_id: input.updateId ?? nextUpdateId, message }
}

/** Запрос ровно такой, какой шлёт Telegram: тот же путь, тот же заголовок. */
export function postUpdate(
  baseUrl: string,
  body: unknown,
  options: { secret?: string; path?: string } = {},
): Promise<Response> {
  return fetch(`${baseUrl}/api/telegram/webhook/${options.path ?? WEBHOOK_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': options.secret ?? WEBHOOK_SECRET,
    },
    body: JSON.stringify(body),
  })
}
