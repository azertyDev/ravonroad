import { Injectable } from '@nestjs/common'
import type { ReportStatus } from '@ravonroad/shared-types'
import { PrismaService } from '../../prisma/prisma.service'
import { applyTransition, isTerminal } from '../../reports/transitions'
import { BotApiClient } from '../bot-api.client'
import { displayNumber } from '../card.renderer'
import { CardUpdater } from '../card.updater'
import { applyOnce } from '../idempotency'
import { logEvent } from '../../common/logger'
import type { IncomingMessage } from '../update'

/** Текстовый ввод в двухшаговом переходе (SRS §6.5, §2.12).
 *
 *  Два случая требуют текста: причина «другое» и номер оригинала при `DUPLICATE`.
 *  Бот отправляет сообщение с `ForceReply` и запоминает строку в `bot_prompt`; ответ
 *  находится по `message.reply_to_message.message_id`.
 *
 *  Отвечать может **только** тот модератор, который начал переход. Проверка серверная:
 *  ответить на чужой `ForceReply` в группе может кто угодно. */

/** Час жизни prompt. Дольше — и модератор уже не помнит, на что отвечает; короче —
 *  и разбор очереди с телефона в дороге перестаёт работать. */
const PROMPT_TTL_MS = 60 * 60 * 1000

const MAX_REASON_TEXT = 500

@Injectable()
export class PromptHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: BotApiClient,
    private readonly cards: CardUpdater,
  ) {}

  /** Спросить текст. Сообщение уходит **напрямую**, а не через outbox: модератор ждёт
   *  клавиатуру ответа сразу после нажатия, а не через проход воркера. */
  async ask(input: {
    chatId: number
    reportId: number
    publicNumber: number
    moderatorId: number
    kind: 'REASON_TEXT' | 'DUPLICATE_NUMBER'
    targetStatus: ReportStatus
  }): Promise<void> {
    const question =
      input.kind === 'DUPLICATE_NUMBER'
        ? `${displayNumber(input.publicNumber)}: ответьте номером оригинала, например ${displayNumber(3471)}`
        : `${displayNumber(input.publicNumber)}: ответьте текстом причины`

    const message = await this.bot.sendMessage({
      chat_id: String(input.chatId),
      text: question,
      // `selective` направляет клавиатуру ответа тому, кто нажал; правом ответа
      // это не является — право проверяется на сервере.
      reply_markup: { force_reply: true, selective: true },
    })

    await this.prisma.botPrompt.create({
      data: {
        chatId: BigInt(input.chatId),
        messageId: message.message_id,
        reportId: input.reportId,
        kind: input.kind,
        targetStatus: input.targetStatus,
        moderatorId: input.moderatorId,
        expiresAt: new Date(Date.now() + PROMPT_TTL_MS),
      },
    })
  }

  /** Ответ на `ForceReply`. `null` — это не ответ на наш prompt, и сообщение должен
   *  разобрать кто-то другой (фотографии «после», ссылка на публикацию). */
  async handle(updateId: number, message: IncomingMessage): Promise<string | null> {
    const replyTo = message.reply_to_message
    const from = message.from
    if (replyTo === null || from === null || message.text === null) return null

    const prompt = await this.prisma.botPrompt.findUnique({
      where: { chatId_messageId: { chatId: BigInt(message.chat.id), messageId: replyTo.message_id } },
      select: {
        reportId: true,
        kind: true,
        targetStatus: true,
        moderatorId: true,
        expiresAt: true,
        moderator: { select: { telegramUserId: true, isActive: true } },
        report: { select: { publicNumber: true } },
      },
    })
    if (prompt === null) return null

    if (Number(prompt.moderator.telegramUserId) !== from.id || !prompt.moderator.isActive) {
      return 'Отвечать может только тот модератор, который начал переход'
    }
    if (prompt.expiresAt.getTime() <= Date.now()) {
      await this.forget(message.chat.id, replyTo.message_id)
      return 'Время истекло, начните заново'
    }

    const answer =
      prompt.kind === 'DUPLICATE_NUMBER'
        ? await this.applyDuplicate(updateId, prompt.reportId, prompt.report.publicNumber, message.text, {
            moderatorId: prompt.moderatorId,
            telegramUserId: from.id,
          })
        : await this.applyReasonText(
            updateId,
            prompt.report.publicNumber,
            prompt.targetStatus,
            message.text,
            { moderatorId: prompt.moderatorId, telegramUserId: from.id },
          )

    if (answer.applied) await this.forget(message.chat.id, replyTo.message_id)
    return answer.text
  }

  private async forget(chatId: number, messageId: number): Promise<void> {
    await this.prisma.botPrompt.deleteMany({ where: { chatId: BigInt(chatId), messageId } })
  }

  private async applyReasonText(
    updateId: number,
    publicNumber: number,
    targetStatus: ReportStatus | null,
    text: string,
    actor: { moderatorId: number; telegramUserId: number },
  ): Promise<{ text: string; applied: boolean }> {
    const reasonText = text.trim()
    if (reasonText === '') return { text: 'Причина не может быть пустой', applied: false }
    if (targetStatus === null) return { text: 'Переход утерян, начните заново', applied: true }

    return this.transition(updateId, publicNumber, targetStatus, actor, {
      reason: 'other',
      reasonText: reasonText.slice(0, MAX_REASON_TEXT),
    })
  }

  /** Номер оригинала проверяется полностью (US-021): заявка существует, это не она сама,
   *  и оригинал не в статусе `DUPLICATE` — иначе получилась бы цепочка дубликатов,
   *  ведущая в никуда. */
  private async applyDuplicate(
    updateId: number,
    reportId: number,
    publicNumber: number,
    text: string,
    actor: { moderatorId: number; telegramUserId: number },
  ): Promise<{ text: string; applied: boolean }> {
    const match = /^\s*(?:RR-)?(\d{1,9})\s*$/i.exec(text)
    if (match?.[1] === undefined) return { text: 'Нужен номер заявки, например RR-3471', applied: false }

    const originalNumber = Number(match[1])
    if (originalNumber === publicNumber) {
      return { text: 'Заявка не может быть дубликатом самой себя', applied: false }
    }

    const original = await this.prisma.report.findUnique({
      where: { publicNumber: originalNumber },
      select: { id: true, status: true },
    })
    if (original === null) return { text: `Заявки ${displayNumber(originalNumber)} не существует`, applied: false }
    if (original.id === reportId) {
      return { text: 'Заявка не может быть дубликатом самой себя', applied: false }
    }
    if (original.status === 'DUPLICATE') {
      return {
        text: `${displayNumber(originalNumber)} сама помечена дубликатом — укажите оригинал`,
        applied: false,
      }
    }

    return this.transition(updateId, publicNumber, 'DUPLICATE', actor, { duplicateOfId: original.id })
  }

  private async transition(
    updateId: number,
    publicNumber: number,
    to: ReportStatus,
    actor: { moderatorId: number; telegramUserId: number },
    extra: { reason?: string; reasonText?: string; duplicateOfId?: number },
  ): Promise<{ text: string; applied: boolean }> {
    const outcome = await applyOnce(this.prisma, updateId, async (tx) => {
      const result = await applyTransition(tx, {
        publicNumber,
        to,
        actor: {
          type: 'MODERATOR',
          telegramUserId: BigInt(actor.telegramUserId),
          moderatorId: actor.moderatorId,
        },
        ...extra,
      })
      if (!result.ok) return result
      if (isTerminal(result.to)) await this.cards.enqueueTerminalEdits(tx, result.reportId)
      else await this.cards.enqueueEdit(tx, result.reportId)
      return result
    })

    if (outcome === null) return { text: 'Уже обработано', applied: true }
    if (!outcome.ok) {
      return outcome.code === 'NOT_FOUND'
        ? { text: 'Заявка не найдена', applied: true }
        : { text: 'Статус уже изменён другим модератором', applied: true }
    }

    logEvent('info', 'status_changed', {
      updateId,
      reportId: outcome.reportId,
      moderatorId: actor.moderatorId,
      from: outcome.from,
      to: outcome.to,
    })
    return { text: `${displayNumber(publicNumber)} — готово`, applied: true }
  }
}
