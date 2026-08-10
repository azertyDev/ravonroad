import { Body, Controller, Headers, HttpCode, HttpException, HttpStatus, Param, Post } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BatchService } from './batch.service'
import { BotApiClient } from './bot-api.client'
import { parseCallbackData, type CallbackData } from './callback-data'
import { CardUpdater } from './card.updater'
import { statusFromArg } from './card.renderer'
import { AfterPhotoHandler } from './handlers/after-photo.handler'
import { PromptHandler } from './handlers/prompt.handler'
import { PublicationHandler } from './handlers/publication.handler'
import { ReasonHandler } from './handlers/reason.handler'
import { StatusHandler } from './handlers/status.handler'
import { UndoHandler } from './handlers/undo.handler'
import { logEvent } from './log'
import { ModeratorGuard } from './moderator.guard'
import { PrismaService } from '../prisma/prisma.service'
import { isValidWebhookSecret } from './secret'
import { parseUpdate, type CallbackAnswer, type IncomingCallbackQuery, type Update } from './update'

/** Единственный вход Telegram в систему (SRS §6.2, §9.3).
 *
 *  Порядок проверок на каждый `callback_query` жёсткий и менять его нельзя:
 *  secret-token → allowlist → допустимость перехода → транзакция → `answerCallbackQuery`.
 *  Ни одна запись в БД не происходит раньше второго шага.
 *
 *  Код ответа осмысленный (SRS §6.11): транзиентная ошибка выходит исключением и даёт
 *  `500` — пусть Telegram повторит; логическая (неизвестная кнопка, чужой формат) даёт
 *  `200`, потому что повтор ничего не изменит, а ретраи создадут шторм. */
@Controller('telegram')
export class WebhookController {
  private readonly secret: string
  private readonly path: string | null

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly bot: BotApiClient,
    private readonly guard: ModeratorGuard,
    private readonly status: StatusHandler,
    private readonly reasons: ReasonHandler,
    private readonly prompts: PromptHandler,
    private readonly undo: UndoHandler,
    private readonly photos: AfterPhotoHandler,
    private readonly publication: PublicationHandler,
    private readonly batches: BatchService,
    private readonly cards: CardUpdater,
  ) {
    this.secret = this.config.getOrThrow<string>('TELEGRAM_WEBHOOK_SECRET')
    // Случайный сегмент пути — второй эшелон, самостоятельной защитой не считается
    // (SRS §9.3). Не задан — не проверяется: единственная обязательная проверка здесь
    // это secret-token, и подменять её проверкой пути было бы самообманом.
    this.path = this.config.get<string>('TELEGRAM_WEBHOOK_PATH') ?? null
  }

  @Post('webhook/:path')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Param('path') path: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    if (!isValidWebhookSecret(secret, this.secret) || (this.path !== null && path !== this.path)) {
      logEvent('warn', 'webhook_auth_failed')
      // Тело апдейта дальше не разбирается: ни одного обращения к БД, ни одного
      // обращения к Bot API этот путь не делает. (JSON успевает разобрать глобальный
      // парсер Nest — он стоит до маршрутизации и к нашему решению отношения не имеет.)
      throw new HttpException('unauthorized', HttpStatus.UNAUTHORIZED)
    }

    const update = parseUpdate(body)
    // Не апдейт вовсе. Повторять нечего — отвечаем 200 и молчим.
    if (update === null) return { ok: true }

    if (update.callback_query !== null) await this.onCallback(update.update_id, update.callback_query)
    else if (update.message !== null) await this.onMessage(update)
    return { ok: true }
  }

  private async onCallback(updateId: number, query: IncomingCallbackQuery): Promise<void> {
    const data = parseCallbackData(query.data)
    if (data === null) {
      await this.bot.answerCallbackQuery(query.id, 'Кнопка устарела', true)
      return
    }

    const moderator = await this.guard.check(query.from.id)
    // Отмена — единственная кнопка, право на которую даёт авторство перехода, а не
    // allowlist: переход в `DONE` совершает волонтёр, и отменить свою ошибку должен
    // он же (PRD §12.4, SRS §6.10). Проверка авторства при этом строже: она называет
    // одного человека.
    if (moderator === null && data.op !== 'u') {
      this.guard.reject(query.from.id, updateId)
      await this.bot.answerCallbackQuery(query.id, 'Действие доступно только модераторам', true)
      return
    }

    const answer = await this.dispatch(updateId, data, query, moderator)
    await this.bot.answerCallbackQuery(query.id, answer.text, answer.alert ?? false)
  }

  private async dispatch(
    updateId: number,
    data: CallbackData,
    query: IncomingCallbackQuery,
    moderator: Awaited<ReturnType<ModeratorGuard['check']>>,
  ): Promise<CallbackAnswer> {
    if (data.op === 'u') {
      return this.undo.handle({
        updateId,
        historyId: data.n,
        telegramUserId: query.from.id,
        moderator,
      })
    }
    // Все прочие ветки требуют модератора — он проверен до вызова.
    if (moderator === null) return { text: 'Действие доступно только модераторам', alert: true }

    switch (data.op) {
      case 's': {
        const to = statusFromArg(data.arg)
        if (to === null) return { text: 'Кнопка устарела', alert: true }
        return this.status.apply({
          updateId,
          publicNumber: data.n,
          to,
          moderator,
          telegramUserId: query.from.id,
        })
      }
      case 'r':
      case 'o':
        return this.reasons.show(data.n, ReasonHandler.targetOf(data.op), query)
      case 'z':
        return this.reasons.back(data.n, query)
      case 'R':
      case 'O':
        return this.reasons.choose({
          updateId,
          publicNumber: data.n,
          target: ReasonHandler.targetOf(data.op),
          code: data.arg ?? '',
          moderator,
          query,
        })
      case 'd':
        return this.askDuplicate(data.n, moderator.id, query)
      case 'B':
        return this.batches.handle({ updateId, batchId: data.n, arg: data.arg, moderator, query })
      case 'b':
        return this.batches.expand(data.n)
      default:
        return this.batches.undoBatch({
          updateId,
          batchId: data.n,
          telegramUserId: query.from.id,
          moderator,
        })
    }
  }

  private async askDuplicate(
    publicNumber: number,
    moderatorId: number,
    query: IncomingCallbackQuery,
  ): Promise<CallbackAnswer> {
    const chatId = query.message?.chat.id
    if (chatId === undefined) return { text: 'Сообщение недоступно', alert: true }

    const report = await this.prisma.report.findUnique({ where: { publicNumber }, select: { id: true } })
    if (report === null) return { text: 'Заявка не найдена', alert: true }

    await this.prompts.ask({
      chatId,
      reportId: report.id,
      publicNumber,
      moderatorId,
      kind: 'DUPLICATE_NUMBER',
      targetStatus: 'DUPLICATE',
    })
    return { text: 'Ответьте на сообщение бота номером оригинала' }
  }

  /** Сообщения разбираются в порядке убывания определённости: фотографии — это всегда
   *  закрытие заявки, ответ на `ForceReply` — всегда шаг перехода, и только оставшийся
   *  текст может оказаться ссылкой на публикацию. */
  private async onMessage(update: Update): Promise<void> {
    const message = update.message
    if (message === null) return

    if (await this.photos.handle(update.update_id, message)) return

    const promptAnswer = await this.prompts.handle(update.update_id, message)
    if (promptAnswer !== null) {
      await this.cards.enqueueReply(this.prisma, { chat_id: String(message.chat.id), text: promptAnswer })
      return
    }

    await this.publication.handle(update.update_id, message)
  }
}
