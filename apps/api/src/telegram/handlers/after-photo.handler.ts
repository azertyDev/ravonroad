import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { MAX_PHOTOS_PER_REPORT, type ReportStatus } from '@ravonroad/shared-types'
import type { Prisma } from '../../generated/prisma/client'
import { incomingKey } from '../../media/object-keys'
import { S3Service } from '../../media/s3.service'
import { PrismaService } from '../../prisma/prisma.service'
import { applyTransition } from '../../reports/transitions'
import { BotApiClient } from '../bot-api.client'
import { displayNumber } from '../card.renderer'
import { REPLIES, STATUS_LABELS } from '../labels'
import { CardUpdater } from '../card.updater'
import { applyOnce, claimUpdate } from '../idempotency'
import { logEvent } from '../../common/logger'
import type { IncomingMessage, TelegramPhotoSize } from '../update'

/** Приём фотографий «после» (US-028, US-030, SRS §6.8).
 *
 *  Правило одно: **фото ответом на карточку заявки**. Заявка ищется по паре
 *  «чат + сообщение, на которое ответили» среди двух `message_id` карточки.
 *
 *  **Отправитель не проверяется по allowlist** — решение PRD §12.4, принятое осознанно:
 *  требование быть модератором остановило бы закрытие заявок в поле, где телефон
 *  в руках у того, кто копал. Риск закрывается закрытостью группы, а не техникой.
 *
 *  Альбом приходит несколькими апдейтами с общим `media_group_id`, поэтому он
 *  буферизуется две секунды и обрабатывается разом: иначе три фотографии дали бы три
 *  попытки перехода, из которых две получили бы «статус уже изменён». */

/** Столько ждём остальные части альбома. Telegram доставляет их подряд, задержка между
 *  первым и последним измеряется миллисекундами; две секунды — запас, а не оценка. */
const ALBUM_WINDOW_MS = 2000

interface BufferedAlbum {
  timer: ReturnType<typeof setTimeout>
  message: IncomingMessage
  photos: TelegramPhotoSize[]
}

@Injectable()
export class AfterPhotoHandler implements OnModuleDestroy {
  /** Буфер живёт в памяти процесса — как бюджет отправки и лимиты приёма. Второй
   *  экземпляр api молча сломает его, и это записано в SRS §12.3 явно. */
  private readonly albums = new Map<string, BufferedAlbum>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: BotApiClient,
    private readonly s3: S3Service,
    private readonly cards: CardUpdater,
  ) {}

  onModuleDestroy(): void {
    for (const album of this.albums.values()) clearTimeout(album.timer)
    this.albums.clear()
  }

  /** `true` — сообщение обработано (или принято в буфер) и другим обработчикам
   *  не предназначено. */
  async handle(updateId: number, message: IncomingMessage): Promise<boolean> {
    if (message.photo === null) return false

    if (message.reply_to_message === null) {
      await this.reply(message.chat.id, REPLIES.replyToCard)
      return true
    }

    // Самый крупный размер — последний в массиве. Меньшие Telegram отдаёт для превью,
    // а нам нужен кадр, по которому видно, что яма закрыта.
    const largest = message.photo[message.photo.length - 1]
    if (largest === undefined) return false

    if (message.media_group_id === null) {
      await this.close(updateId, message, [largest])
      return true
    }

    // Части альбома: занимаем `update_id` сразу (эффект — попадание в буфер), а работу
    // делаем один раз по всей пачке. Повторная доставка той же части сюда не дойдёт,
    // а если и дойдёт — её остановят `photo_dedup_idx` и условный `UPDATE` (SRS §6.11).
    const claimed = await this.prisma.$transaction((tx) => claimUpdate(tx, updateId))
    if (!claimed) return true
    this.buffer(`${message.chat.id}:${message.media_group_id}`, message, largest)
    return true
  }

  private buffer(key: string, message: IncomingMessage, photo: TelegramPhotoSize): void {
    const existing = this.albums.get(key)
    if (existing !== undefined) {
      existing.photos.push(photo)
      return
    }

    const album: BufferedAlbum = {
      message,
      photos: [photo],
      timer: setTimeout(() => {
        this.albums.delete(key)
        // Буфер срабатывает вне запроса, поэтому отказ здесь некому вернуть кодом —
        // только в лог; волонтёр видит ответ бота или его отсутствие.
        this.close(null, album.message, album.photos).catch((error: unknown) => {
          logEvent('error', 'after_photo_failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }, ALBUM_WINDOW_MS),
    }
    album.timer.unref()
    this.albums.set(key, album)
  }

  private async close(
    updateId: number | null,
    message: IncomingMessage,
    photos: TelegramPhotoSize[],
  ): Promise<void> {
    const replyToId = message.reply_to_message?.message_id
    if (replyToId === undefined) return

    const report = await this.findByMessage(message.chat.id, replyToId)
    if (report === null) {
      await this.reply(message.chat.id, REPLIES.replyToCard)
      return
    }

    if (report.status !== 'ACCEPTED' && report.status !== 'IN_PROGRESS' && report.status !== 'DONE') {
      await this.reply(
        message.chat.id,
        REPLIES.wrongStatusForPhotos(displayNumber(report.publicNumber), STATUS_LABELS[report.status]),
        report.id,
      )
      return
    }

    const free = MAX_PHOTOS_PER_REPORT - report.afterCount
    if (free <= 0) {
      await this.reply(
        message.chat.id,
        REPLIES.photoLimitReached(displayNumber(report.publicNumber), MAX_PHOTOS_PER_REPORT),
        report.id,
      )
      return
    }

    const accepted = photos.slice(0, free)
    // Загрузка и запись в БД разнесены намеренно: sharp здесь не вызывается вовсе,
    // а транзакция не должна держаться открытой на время сетевых вызовов (SRS §6.8 п.6).
    const rawKeys = await this.download(accepted)
    if (rawKeys.length === 0) {
      await this.reply(message.chat.id, REPLIES.photoDownloadFailed, report.id)
      return
    }

    const sender = message.from?.id ?? null
    const outcome = await this.store(updateId, report, rawKeys, sender)

    const skipped = photos.length - accepted.length
    const tail = skipped > 0 ? REPLIES.photosSkipped(accepted.length, MAX_PHOTOS_PER_REPORT) : ''

    // Повторная доставка того же апдейта: эффект уже был, второго ответа не нужно.
    if (outcome === 'REPLAY') return
    if (outcome === 'ALREADY_DONE') {
      await this.reply(message.chat.id, REPLIES.photosAdded(displayNumber(report.publicNumber), tail), report.id)
      return
    }
    if (outcome === 'CHANGED') {
      await this.reply(message.chat.id, REPLIES.photosStatusChanged(displayNumber(report.publicNumber)), report.id)
      return
    }
    await this.reply(message.chat.id, REPLIES.reportClosed(displayNumber(report.publicNumber), tail), report.id)
  }

  /** Заявка ищется по обоим `message_id` карточки: волонтёр отвечает и на альбом,
   *  и на сообщение с кнопками — для него это одна карточка (SRS §6.8 п.1). */
  private async findByMessage(chatId: number, messageId: number) {
    // Карточки живут в одной группе, её идентификатор в окружении. Ответ из другого
    // чата не имеет к заявке отношения, даже если номер сообщения случайно совпал.
    if (String(chatId) !== this.bot.groupChatId) return null

    const rows = await this.prisma.$queryRaw<
      { id: number; public_number: number; status: ReportStatus; after_count: bigint }[]
    >`
      SELECT r.id, r.public_number, r.status,
             (SELECT count(*) FROM report_photo p WHERE p.report_id = r.id AND p.kind = 'AFTER') AS after_count
        FROM report r
       WHERE r.telegram_album_message_id = ${messageId} OR r.telegram_card_message_id = ${messageId}
       LIMIT 1`
    const row = rows[0]
    if (row === undefined) return null
    return {
      id: row.id,
      publicNumber: row.public_number,
      status: row.status,
      afterCount: Number(row.after_count),
    }
  }

  private async download(photos: TelegramPhotoSize[]): Promise<string[]> {
    const keys: string[] = []
    for (const photo of photos) {
      try {
        const path = await this.bot.getFilePath(photo.file_id)
        const response = await fetch(this.bot.fileUrl(path), { signal: AbortSignal.timeout(15_000) })
        if (!response.ok) throw new Error(`file download failed: ${response.status}`)
        const key = incomingKey()
        await this.s3.putRaw(key, Buffer.from(await response.arrayBuffer()), 'image/jpeg')
        keys.push(key)
      } catch (error) {
        logEvent('warn', 'photo_rejected', { error: error instanceof Error ? error.message : String(error) })
      }
    }
    return keys
  }

  /** Одна транзакция: строки фотографий в `PENDING`, переход в `DONE`, правка карточки.
   *  Переход **не ждёт** обработки фотографий: BR-006 требует их наличия, а не превью. */
  private async store(
    updateId: number | null,
    report: { id: number; publicNumber: number; status: ReportStatus; afterCount: number },
    rawKeys: string[],
    senderId: number | null,
  ): Promise<'DONE' | 'ALREADY_DONE' | 'CHANGED' | 'REPLAY'> {
    const effect = async (tx: Prisma.TransactionClient) => {
      await tx.reportPhoto.createMany({
        data: rawKeys.map((rawKey, index) => ({
          reportId: report.id,
          kind: 'AFTER' as const,
          sortOrder: report.afterCount + index,
          rawKey,
          uploadedByTelegramUserId: senderId === null ? null : BigInt(senderId),
        })),
      })

      if (report.status === 'DONE') {
        // Заявка уже закрыта: фотографии добавляются, счётчик повторно не растёт —
        // он считается запросом по статусу, а статус не меняется (PRD 5.3.2).
        await this.cards.enqueueEdit(tx, report.id)
        return 'ALREADY_DONE' as const
      }

      const transition = await applyTransition(tx, {
        publicNumber: report.publicNumber,
        to: 'DONE',
        actor: {
          type: 'VOLUNTEER',
          telegramUserId: senderId === null ? null : BigInt(senderId),
          moderatorId: null,
        },
      })
      if (!transition.ok) throw new StatusChanged()

      // `DONE` терминален, значит появляется окно отмены — и снимается через 15 минут.
      await this.cards.enqueueTerminalEdits(tx, report.id)
      logEvent('info', 'status_changed', {
        reportId: report.id,
        from: transition.from,
        to: transition.to,
        ...(updateId === null ? {} : { updateId }),
      })
      return 'DONE' as const
    }

    try {
      // Одиночная фотография занимает `update_id` в той же транзакции, что и эффект;
      // у альбома он занят раньше, при попадании в буфер.
      const result =
        updateId === null ? await this.prisma.$transaction(effect) : await applyOnce(this.prisma, updateId, effect)
      return result ?? 'REPLAY'
    } catch (error) {
      if (error instanceof StatusChanged) return 'CHANGED'
      throw error
    }
  }

  /** Ответ волонтёру идёт через очередь: это сообщение в ту же группу и тот же бюджет
   *  в 20 сообщений в минуту (SRS §6.7). */
  private async reply(chatId: number, text: string, reportId: number | null = null): Promise<void> {
    await this.cards.enqueueReply(this.prisma, { chat_id: String(chatId), text }, reportId)
  }
}

/** Между чтением статуса и транзакцией заявку успели перевести. Исключение, а не код
 *  возврата: строки фотографий уже вставлены, и откатить их обязана та же транзакция. */
class StatusChanged extends Error {}
