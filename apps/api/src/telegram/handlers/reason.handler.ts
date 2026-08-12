import { Injectable } from '@nestjs/common'
import type { ReportStatus } from '@ravonroad/shared-types'
import { OUT_OF_SCOPE_REASONS, REJECT_REASONS } from '../../reports/transitions'
import { BotApiClient } from '../bot-api.client'
import { CardRenderer, isCombined } from '../card.renderer'
import { ANSWERS } from '../labels'
import type { CallbackAnswer, IncomingCallbackQuery } from '../update'
import type { ActiveModerator } from '../moderator.guard'
import { PromptHandler } from './prompt.handler'
import { StatusHandler } from './status.handler'

/** Двухшаговые переходы с причиной из списка (US-020, US-022, SRS §6.5).
 *
 *  Кнопки причин заменяют кнопки статусов **в том же сообщении**: `editMessageText`,
 *  а не новое сообщение. Новых уведомлений в группе не появляется, шум нулевой —
 *  а при очереди в сотни заявок шум и есть то, из-за чего группу перестают читать.
 *
 *  Переход без причины не выполняется никогда: обязательность стоит в PRD §5.2,
 *  а физически её обеспечивает то, что перехода без второго нажатия просто не бывает. */
@Injectable()
export class ReasonHandler {
  constructor(
    private readonly bot: BotApiClient,
    private readonly cards: CardRenderer,
    private readonly status: StatusHandler,
    private readonly prompts: PromptHandler,
  ) {}

  /** Первый шаг: показать причины вместо кнопок статусов. */
  async show(
    publicNumber: number,
    target: 'REJECTED' | 'OUT_OF_SCOPE',
    query: IncomingCallbackQuery,
  ): Promise<CallbackAnswer> {
    const edited = await this.replaceKeyboard(publicNumber, query, this.cards.reasonKeyboard(publicNumber, target))
    return edited ? { text: ANSWERS.chooseReason } : { text: ANSWERS.reportNotFound, alert: true }
  }

  /** «Назад»: причины исчезают, кнопки статусов возвращаются. Кнопка существует потому,
   *  что промахнуться по «Отклонить» так же легко, как по любой другой. */
  async back(publicNumber: number, query: IncomingCallbackQuery): Promise<CallbackAnswer> {
    const card = await this.cards.loadByNumber(publicNumber)
    if (card === null) return { text: ANSWERS.reportNotFound, alert: true }
    await this.replaceKeyboard(publicNumber, query, this.cards.keyboard(card))
    return { text: '' }
  }

  /** Второй шаг: причина выбрана. «Другое» уходит в `ForceReply` — текст обязателен
   *  и приходит отдельным сообщением (SRS §6.5). */
  async choose(input: {
    updateId: number
    publicNumber: number
    target: 'REJECTED' | 'OUT_OF_SCOPE'
    code: string
    moderator: ActiveModerator
    query: IncomingCallbackQuery
  }): Promise<CallbackAnswer> {
    const codes: readonly string[] = input.target === 'REJECTED' ? REJECT_REASONS : OUT_OF_SCOPE_REASONS
    if (!codes.includes(input.code)) return { text: ANSWERS.unknownReason, alert: true }

    const card = await this.cards.loadByNumber(input.publicNumber)
    if (card === null) return { text: ANSWERS.reportNotFound, alert: true }

    if (input.code === 'other') {
      const chatId = input.query.message?.chat.id
      if (chatId === undefined) return { text: ANSWERS.messageUnavailable, alert: true }
      await this.prompts.ask({
        chatId,
        reportId: card.id,
        publicNumber: input.publicNumber,
        moderatorId: input.moderator.id,
        kind: 'REASON_TEXT',
        targetStatus: input.target,
      })
      return { text: ANSWERS.answerWithReason }
    }

    return this.status.apply({
      updateId: input.updateId,
      publicNumber: input.publicNumber,
      to: input.target,
      moderator: input.moderator,
      telegramUserId: input.query.from.id,
      reason: input.code,
    })
  }

  /** Правка идёт напрямую, а не через outbox: это ответ на нажатие, и ждать прохода
   *  воркера здесь значило бы показывать модератору неотвечающие кнопки. */
  private async replaceKeyboard(
    publicNumber: number,
    query: IncomingCallbackQuery,
    keyboard: { text: string; callback_data: string }[][],
  ): Promise<boolean> {
    const card = await this.cards.loadByNumber(publicNumber)
    const message = query.message
    if (card === null || message === null) return false

    await this.bot.editCard({
      chat_id: String(message.chat.id),
      message_id: message.message_id,
      text: this.cards.cardText(card),
      reply_markup: { inline_keyboard: keyboard },
      asCaption: isCombined(card),
    })
    return true
  }

  /** Целевой статус кнопки — часть протокола, а не строка: `r` ведёт в `REJECTED`,
   *  `o` — в `OUT_OF_SCOPE`, и третьего варианта у списка причин нет. */
  static targetOf(op: 'r' | 'o' | 'R' | 'O'): ReportStatus & ('REJECTED' | 'OUT_OF_SCOPE') {
    return op === 'r' || op === 'R' ? 'REJECTED' : 'OUT_OF_SCOPE'
  }
}
