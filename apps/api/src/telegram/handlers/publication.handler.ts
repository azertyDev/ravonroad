import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { BotApiClient } from '../bot-api.client'
import { displayNumber } from '../card.renderer'
import { REPLIES, STATUS_LABELS } from '../labels'
import { CardUpdater } from '../card.updater'
import { applyOnce } from '../idempotency'
import type { IncomingMessage } from '../update'

/** Ссылка на публикацию (US-029, SRS §6.9).
 *
 *  Ответ на карточку **без фотографий**, содержащий ссылку, при статусе `DONE`
 *  перезаписывает `publication_url` целиком. Именно целиком: у заявки один пост,
 *  а не лента постов, и «добавить вторую» означало бы сущность, которой в MVP нет. */

const MAX_URL_LENGTH = 512

/** Только `http` и `https`. `javascript:` и `data:` до рендера бы не дожили — текст
 *  экранируется, — но ссылка ещё и уходит в публичную карточку, а там она уже атрибут. */
function firstHttpUrl(text: string): string | null {
  for (const token of text.split(/\s+/)) {
    if (!/^https?:\/\/\S+$/i.test(token)) continue
    if (token.length > MAX_URL_LENGTH) continue
    try {
      const url = new URL(token)
      if (url.protocol === 'http:' || url.protocol === 'https:') return token
    } catch {
      continue
    }
  }
  return null
}

@Injectable()
export class PublicationHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: BotApiClient,
    private readonly cards: CardUpdater,
  ) {}

  /** `true` — сообщение было ссылкой на публикацию и обработано здесь. */
  async handle(updateId: number, message: IncomingMessage): Promise<boolean> {
    const replyTo = message.reply_to_message
    if (replyTo === null || message.text === null || message.photo !== null) return false
    if (String(message.chat.id) !== this.bot.groupChatId) return false

    const url = firstHttpUrl(message.text)
    if (url === null) return false

    const report = await this.prisma.report.findFirst({
      where: {
        OR: [{ telegramAlbumMessageId: replyTo.message_id }, { telegramCardMessageId: replyTo.message_id }],
      },
      select: { id: true, publicNumber: true, status: true },
    })
    if (report === null) return false

    if (report.status !== 'DONE') {
      await this.cards.enqueueReply(
        this.prisma,
        {
          chat_id: String(message.chat.id),
          text: REPLIES.publicationTooEarly(displayNumber(report.publicNumber), STATUS_LABELS[report.status]),
        },
        report.id,
      )
      return true
    }

    const saved = await applyOnce(this.prisma, updateId, async (tx) => {
      await tx.report.update({ where: { id: report.id }, data: { publicationUrl: url } })
      await this.cards.enqueueEdit(tx, report.id)
      return true
    })
    if (saved === null) return true

    await this.cards.enqueueReply(
      this.prisma,
      { chat_id: String(message.chat.id), text: REPLIES.publicationSaved(displayNumber(report.publicNumber)) },
      report.id,
    )
    return true
  }
}
