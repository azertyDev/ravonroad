import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import {
  BotApiClient,
  BotApiError,
  type InlineKeyboardButton,
  type InputMediaPhoto,
  type SendMessageParams,
} from './bot-api.client'
import { CardRenderer, isCombined } from './card.renderer'
import { DIGEST_SIZE, DIGEST_THRESHOLD, DigestService } from './digest.service'
import { DuplicatesService } from './duplicates.service'
import { logEvent } from '../common/logger'
import { logQueueDepths, queueDepths } from '../common/queue-depths'
import { pendingCardCount, pendingCardsByPriority } from './queue-order'

/** Доставка в Telegram (SRS §6.7).
 *
 *  `setInterval` в том же процессе — та же форма, что у photo-воркера из 002, и ни одного
 *  нового механизма: ни брокера, ни второго контейнера, которые не помещаются в бюджет
 *  2 ГБ прода и 1 ГБ dev (ADR-0002, ADR-0007).
 *
 *  Создание заявки **никогда** не ждёт Telegram: строка кладётся в очередь в транзакции
 *  перехода, а отправка идёт отдельно и позже. Недоступный Telegram не теряет карточки
 *  и не мешает принимать заявки (US-018). */

const POLL_INTERVAL_MS = 10_000

/** Bot API ограничивает бота примерно двадцатью сообщениями в минуту на группу,
 *  и превышение даёт `429` с растущим `retry_after`, то есть наказывает за попытку.
 *  Воркер держит счётчик в скользящем окне и просто не берёт задачи сверх бюджета —
 *  они остаются в таблице до следующей минуты (SRS §6.7).
 *
 *  Отсюда потолок канала: карточка — два сообщения, значит ≈ 600 заявок в час поштучно
 *  против проектного пика в 1000. Это арифметика, а не тюнинг; ответ на неё — digest. */
const BUDGET_PER_MINUTE = 20
const WINDOW_MS = 60_000

/** Карточка — два сообщения: альбом и сообщение с кнопками (SRS §6.3). Заявка
 *  с одной фотографией стоит одно: `sendPhoto` несёт и подпись, и клавиатуру. Бюджет
 *  резервируется по дорогому варианту — сколько фотографий у заявки, до чтения карточки
 *  неизвестно, а ошибиться в меньшую сторону значит выйти за лимит Telegram. */
const CARD_COST = 2

/** Больше десяти задач за проход не берём: проход должен заканчиваться быстрее,
 *  чем наступает следующий. */
const MAX_PER_TICK = 10

/** Аренда взятой задачи. Дольше секунд обработки и короче любого разумного повтора:
 *  упавший процесс не должен держать строку часами. */
const LEASE_MS = 60_000

/** `10 с → 30 с → 2 мин → 10 мин → 30 мин`, дальше каждый час бессрочно.
 *  Dead-letter нет: заявка обязана дойти (US-018). */
const BACKOFF_MS = [10_000, 30_000, 120_000, 600_000, 1_800_000]
const HOURLY_MS = 3_600_000

/** Глубины очередей пишутся не чаще раза в минуту: проход идёт каждые 10 секунд,
 *  и строка на каждый съедала бы потолок 30 МБ на контейнер логов (SRS §12.2 п.5). */
const DEPTH_LOG_INTERVAL_MS = 60_000

interface OutboxRow {
  id: bigint
  report_id: number | null
  kind: 'CARD_CREATE' | 'CARD_EDIT' | 'REPLY' | 'ALERT'
  payload: { method?: string; params?: SendMessageParams }
  attempts: number
}

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private depthLoggedAt = 0
  /** Скользящее окно отправок. Живёт в памяти процесса — как и буфер альбомов,
   *  и лимиты приёма: второй экземпляр api молча сломает и то, и другое (SRS §12.3). */
  private readonly sends: number[] = []

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: BotApiClient,
    private readonly cards: CardRenderer,
    private readonly digest: DigestService,
    private readonly duplicates: DuplicatesService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.tick().catch((error: unknown) => {
        logEvent('error', 'outbox_tick_failed', { error: error instanceof Error ? error.message : String(error) })
      })
    }, POLL_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  /** Один проход. Публичный, потому что интеграционные тесты гоняют воркер шагами:
   *  ждать десятисекундного таймера значило бы мерить сон. Возвращает число
   *  отправленных сообщений. */
  async tick(): Promise<number> {
    if (this.running) return 0
    this.running = true
    try {
      // Четыре числа SRS §10.3: без них перегрузка обнаруживается по сообщению
      // в группе «а где мои фотки», то есть после того, как её заметил житель.
      if (Date.now() - this.depthLoggedAt >= DEPTH_LOG_INTERVAL_MS) {
        this.depthLoggedAt = Date.now()
        logQueueDepths(await queueDepths(this.prisma))
      }
      const depth = await pendingCardCount(this.prisma)
      if (depth > DIGEST_THRESHOLD) return await this.sendDigest()
      return await this.sendDue()
    } finally {
      this.running = false
    }
  }

  private budgetLeft(): number {
    const since = Date.now() - WINDOW_MS
    while (this.sends.length > 0 && (this.sends[0] ?? 0) < since) this.sends.shift()
    return BUDGET_PER_MINUTE - this.sends.length
  }

  private spend(messages: number): void {
    const now = Date.now()
    for (let index = 0; index < messages; index += 1) this.sends.push(now)
  }

  /** Поштучная отправка: FIFO по очереди, по одной задаче за раз и с проверкой бюджета
   *  перед каждой. Задача, на которую бюджета не хватило, возвращается в очередь
   *  немедленно — она уйдёт в следующую минуту, а не через аренду. */
  private async sendDue(): Promise<number> {
    let sent = 0
    for (let taken = 0; taken < MAX_PER_TICK; taken += 1) {
      const budget = this.budgetLeft()
      if (budget <= 0) break

      const row = await this.claim()
      if (row === null) break

      if (row.kind === 'CARD_CREATE' && budget < CARD_COST) {
        await this.release(row)
        break
      }

      const messages = await this.handle(row)
      this.spend(messages)
      sent += messages
    }
    return sent
  }

  /** Digest: одно сообщение на десять заявок вместо десяти карточек (SRS §6.13).
   *  Состав фиксируется в `moderation_batch` в момент отправки. */
  private async sendDigest(): Promise<number> {
    if (this.budgetLeft() <= 0) return 0

    const prepared = await this.prisma.$transaction(async (tx) => {
      const pending = await pendingCardsByPriority(tx, DIGEST_SIZE)
      if (pending.length === 0) return null
      const reportIds = pending.map((row) => row.report_id)
      const batch = await this.digest.createBatch(tx, reportIds, this.bot.groupChatId)
      return { batch, outboxIds: pending.map((row) => row.outbox_id) }
    })
    if (prepared === null) return 0

    let message
    try {
      message = await this.bot.sendMessage(prepared.batch.params)
    } catch (error) {
      // Пакет остался без сообщения — строка живёт до следующего прохода и больше
      // ни на что не влияет: без `message_id` её кнопок не существует. Карточки
      // при этом не потеряны, они всё ещё неотправленные.
      logEvent('warn', 'outbox_send_failed', {
        batchId: prepared.batch.id,
        error: error instanceof Error ? error.message : String(error),
      })
      return 0
    }

    this.spend(1)
    await this.prisma.$transaction(async (tx) => {
      await tx.moderationBatch.update({
        where: { id: prepared.batch.id },
        data: { messageId: message.message_id },
      })
      await tx.telegramOutbox.updateMany({
        where: { id: { in: prepared.outboxIds } },
        data: { sentAt: new Date(), lastError: `digest ${prepared.batch.id}` },
      })
    })
    logEvent('info', 'digest_sent', { batchId: prepared.batch.id, count: prepared.outboxIds.length })
    return 1
  }

  private async claim(): Promise<OutboxRow | null> {
    const rows = await this.prisma.$queryRaw<OutboxRow[]>`
      UPDATE telegram_outbox
         SET next_attempt_at = now() + ${LEASE_MS}::float8 * interval '1 millisecond'
       WHERE id = (SELECT id FROM telegram_outbox
                    WHERE sent_at IS NULL AND next_attempt_at <= now()
                    ORDER BY id
                    LIMIT 1
                      FOR UPDATE SKIP LOCKED)
      RETURNING id, report_id, kind, payload, attempts`
    return rows[0] ?? null
  }

  private async release(row: OutboxRow): Promise<void> {
    await this.prisma.telegramOutbox.update({ where: { id: row.id }, data: { nextAttemptAt: new Date() } })
  }

  /** Возвращает число реально отправленных сообщений: бюджет считает сообщения,
   *  а не задачи. */
  private async handle(row: OutboxRow): Promise<number> {
    try {
      switch (row.kind) {
        case 'CARD_CREATE':
          return await this.sendCard(row)
        case 'CARD_EDIT':
          return await this.editCard(row)
        default:
          return await this.sendPayload(row)
      }
    } catch (error) {
      await this.fail(row, error)
      return 0
    }
  }

  private async sendCard(row: OutboxRow): Promise<number> {
    if (row.report_id === null) return await this.done(row, 'card without report')
    const card = await this.cards.load(row.report_id)
    if (card === null) return await this.done(row, 'report vanished')
    // Карточка уже в группе: повторная доставка не создаёт второй.
    if (card.cardMessageId !== null) return await this.done(row, 'card already sent')

    const members = await this.prisma.$transaction((tx) => this.duplicates.members(tx, card.id))
    const cluster = this.duplicates.isCluster(members)
    const keyboard: InlineKeyboardButton[][] = this.cards.keyboard(card)

    let batchId: number | null = null
    if (cluster) {
      batchId = await this.prisma.$transaction((tx) =>
        this.duplicates.createBatch(tx, card.id, members.map((member) => member.report_id), this.bot.groupChatId),
      )
      keyboard.push(...this.duplicates.keyboard(batchId, card.publicNumber, members.length))
    }

    const single = card.photoUrls.length === 1 ? card.photoUrls[0] : undefined
    let albumMessageId: number | null = null
    let cardMessageId: number
    let cost: number

    if (single !== undefined) {
      // Одна фотография — одна карточка одним сообщением: `sendPhoto` принимает и
      // подпись, и клавиатуру, поэтому делить нечего. Группа получает одно уведомление
      // вместо двух, а бюджет канала — одну единицу вместо двух. При двух и трёх
      // фотографиях так не выйдет: `sendMediaGroup` `reply_markup` не принимает,
      // и карточка остаётся двумя сообщениями (SRS §6.3).
      const message = await this.bot.sendPhoto({
        chat_id: this.bot.groupChatId,
        photo: single,
        caption: this.cards.photoCaption(card),
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: keyboard },
      })
      // Оба идентификатора указывают на одно сообщение: волонтёр отвечает на него
      // и фотографиями «после», и ссылкой на публикацию, а ищутся они по обоим полям.
      albumMessageId = message.message_id
      cardMessageId = message.message_id
      cost = 1
    } else {
      const caption = this.cards.caption(card)
      if (card.photoUrls.length > 0) {
        const media: InputMediaPhoto[] = card.photoUrls.map((url, index) => ({
          type: 'photo',
          media: url,
          // Подпись несёт первое фото альбома — так устроен Telegram.
          ...(index === 0 ? { caption, parse_mode: 'HTML' as const } : {}),
        }))
        const album = await this.bot.sendMediaGroup(this.bot.groupChatId, media)
        albumMessageId = album[0]?.message_id ?? null
      } else {
        // Все фотографии заявки не пережили обработку. Карточка всё равно уходит:
        // без неё заявка просто не попадёт к модератору (T-074).
        const text = await this.bot.sendMessage({
          chat_id: this.bot.groupChatId,
          text: caption,
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
        })
        albumMessageId = text.message_id
      }

      const params: SendMessageParams = {
        chat_id: this.bot.groupChatId,
        text: this.cards.statusText(card),
        parse_mode: 'HTML',
        // Номер заявки в тексте — ссылка на её страницу; без этого Telegram развернул бы
        // под каждой карточкой превью сайта.
        link_preview_options: { is_disabled: true },
        reply_markup: { inline_keyboard: keyboard },
      }
      if (albumMessageId !== null) params.reply_to_message_id = albumMessageId
      cardMessageId = (await this.bot.sendMessage(params)).message_id
      cost = CARD_COST
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.report.update({
        where: { id: card.id },
        data: { telegramAlbumMessageId: albumMessageId, telegramCardMessageId: cardMessageId },
      })
      await tx.telegramOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } })
      if (batchId !== null) {
        await tx.moderationBatch.update({ where: { id: batchId }, data: { messageId: cardMessageId } })
        // Спутники кластера уже показаны в этой карточке — своих им не нужно.
        await tx.telegramOutbox.updateMany({
          where: { id: { in: members.map((member) => member.outbox_id) } },
          data: { sentAt: new Date(), lastError: `cluster ${batchId}` },
        })
      }
    })

    logEvent('info', 'card_sent', { reportId: card.id, ...(batchId === null ? {} : { batchId }) })
    return cost
  }

  private async editCard(row: OutboxRow): Promise<number> {
    if (row.report_id === null) return await this.done(row, 'edit without report')
    const card = await this.cards.load(row.report_id)
    if (card === null) return await this.done(row, 'report vanished')
    if (card.cardMessageId === null) {
      // Карточки ещё нет — правка ждёт её. Это не ошибка и не попытка: сдвигаем срок.
      await this.prisma.telegramOutbox.update({
        where: { id: row.id },
        data: { nextAttemptAt: new Date(Date.now() + POLL_INTERVAL_MS) },
      })
      return 0
    }

    await this.bot.editCard({
      chat_id: this.bot.groupChatId,
      message_id: card.cardMessageId,
      text: this.cards.cardText(card),
      reply_markup: { inline_keyboard: this.cards.keyboard(card) },
      asCaption: isCombined(card),
    })
    await this.prisma.telegramOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } })
    return 1
  }

  private async sendPayload(row: OutboxRow): Promise<number> {
    const params = row.payload.params
    if (params === undefined) return await this.done(row, 'payload has no params')
    await this.bot.call(row.payload.method ?? 'sendMessage', params as unknown as Record<string, unknown>)
    await this.prisma.telegramOutbox.update({ where: { id: row.id }, data: { sentAt: new Date() } })
    return 1
  }

  /** Закрыть запись без отправки: отправлять нечего или незачем. */
  private async done(row: OutboxRow, reason: string): Promise<number> {
    await this.prisma.telegramOutbox.update({
      where: { id: row.id },
      data: { sentAt: new Date(), lastError: reason },
    })
    return 0
  }

  private async fail(row: OutboxRow, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)

    if (error instanceof BotApiError && error.retryAfter !== null) {
      // Это расписание, а не ошибка: попытка не засчитывается, сдвигается только срок.
      await this.prisma.telegramOutbox.update({
        where: { id: row.id },
        data: {
          nextAttemptAt: new Date(Date.now() + error.retryAfter * 1000),
          lastError: message.slice(0, 500),
        },
      })
      logEvent('warn', 'telegram_unavailable', { outboxId: Number(row.id), error: `429 retry_after` })
      return
    }

    if (error instanceof BotApiError && error.permanent) {
      // Сообщение удалено, чат недоступен, бот выкинут из группы: бесконечно долбить
      // заведомо мёртвый вызов бессмысленно (SRS §6.7).
      await this.prisma.telegramOutbox.update({
        where: { id: row.id },
        data: { sentAt: new Date(), lastError: message.slice(0, 500) },
      })
      logEvent('error', 'outbox_send_failed', { outboxId: Number(row.id), error: message })
      return
    }

    const attempts = row.attempts + 1
    const backoff = BACKOFF_MS[attempts - 1] ?? HOURLY_MS
    await this.prisma.telegramOutbox.update({
      where: { id: row.id },
      data: {
        attempts,
        nextAttemptAt: new Date(Date.now() + backoff),
        lastError: message.slice(0, 500),
      },
    })
    logEvent('warn', 'outbox_send_failed', { outboxId: Number(row.id), error: message })
  }
}
