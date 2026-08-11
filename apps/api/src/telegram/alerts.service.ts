import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { logEvent } from '../common/logger'
import { queueDepths, type QueueDepths } from '../common/queue-depths'
import { PrismaService } from '../prisma/prisma.service'
import { BotApiClient } from './bot-api.client'
import { WebhookHealthService, webhookAlerts } from './webhook-health.service'

/** Алерты координатору (SRS §10.4).
 *
 *  Канал — тот же бот, но **другой чат**: сообщение о переполненной очереди волонтёрам
 *  не адресовано. Идут они мимо `telegram_outbox` намеренно: бюджет 20 сообщений/мин
 *  принадлежит группе, и алерт о вставшей очереди доставки не должен вставать в ту самую
 *  очередь, о которой сообщает.
 *
 *  Слабое место названо и принято: если недоступен сам Telegram, алерт о его недоступности
 *  не дойдёт. Второй канал — внешний uptime-пинг на `/health`.
 *
 *  Восемь условий — ровно из SRS §10.4, без добавлений «на всякий случай»: алерт, который
 *  приходит без повода, через неделю перестают читать, и вместе с ним перестают читать те,
 *  ради которых всё это писалось. */
const CHECK_INTERVAL_MS = 5 * 60_000

/** Одно сообщение на условие в час. Условие, которое держится час, — это одна поломка,
 *  а не двенадцать. */
const DEDUP_MS = 60 * 60_000

/** Пороги SRS §10.3, §10.4. */
const PHOTO_QUEUE_ALERT = 200
const MODERATION_QUEUE_ALERT = 200
const STALE_QUEUE_S = 600

/** `/ready` отдал 503 дважды подряд: одна неудачная проверка — это секунда сети,
 *  две подряд с интервалом в пять минут — это недоступная база. */
const DB_DOWN_STREAK = 2

export interface Alert {
  condition: string
  text: string
}

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly chatId: string | null
  private readonly sentAt = new Map<string, number>()
  private timer: ReturnType<typeof setInterval> | null = null
  private dbDownStreak = 0

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly bot: BotApiClient,
    private readonly webhook: WebhookHealthService,
  ) {
    // compose передаёт переменную как `${TELEGRAM_ALERT_CHAT_ID:-}`, поэтому «не задана»
    // приходит пустой строкой, а не undefined. Без этой проверки сервис считал бы себя
    // настроенным и раз в пять минут слал алерты в чат с пустым идентификатором —
    // проверено на стенде: строки `alerts_disabled` в логе не было, хотя переменной
    // в `.env` нет.
    const chatId = config.get<string>('TELEGRAM_ALERT_CHAT_ID')?.trim()
    this.chatId = chatId === undefined || chatId === '' ? null : chatId
  }

  onModuleInit(): void {
    if (this.chatId === null) {
      // Локальная разработка и тесты. Молчать об этом нельзя: «алерты настроены»
      // и «алерты выключены» выглядят одинаково ровно до первой поломки.
      logEvent('warn', 'alerts_disabled', { reason: 'TELEGRAM_ALERT_CHAT_ID is not set' })
      return
    }
    this.timer = setInterval(() => {
      this.check().catch((error: unknown) => {
        logEvent('error', 'alerts_check_failed', { error: error instanceof Error ? error.message : String(error) })
      })
    }, CHECK_INTERVAL_MS)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  /** Один проход проверки. Публичный и с явным `now`, потому что дедупликация проверяется
   *  подменой времени: ждать час в тесте значило бы не проверять её вовсе. */
  async check(now: number = Date.now()): Promise<Alert[]> {
    // Канала нет — и проверять нечего: возвращается то, что **отправлено**.
    if (this.chatId === null) return []
    const alerts = [...(await this.databaseAlerts()), ...(await this.telegramAlerts())]
    const due = alerts.filter((alert) => {
      const last = this.sentAt.get(alert.condition)
      return last === undefined || now - last >= DEDUP_MS
    })
    if (due.length === 0) return []

    for (const alert of due) this.sentAt.set(alert.condition, now)
    await this.send(due)
    return due
  }

  /** Всё, что видно из базы: три глубины очередей, провалы обработки и сама доступность
   *  БД. Отказ чтения — это и есть условие «`/ready` отдаёт 503», а не помеха проверке. */
  private async databaseAlerts(): Promise<Alert[]> {
    let depths: QueueDepths
    try {
      depths = await queueDepths(this.prisma)
    } catch (error) {
      this.dbDownStreak += 1
      logEvent('error', 'db_unavailable', {
        error: error instanceof Error ? error.message : String(error),
        count: this.dbDownStreak,
      })
      if (this.dbDownStreak < DB_DOWN_STREAK) return []
      return [{ condition: 'db_down', text: 'База недоступна две проверки подряд. Сайт не принимает заявки.' }]
    }
    this.dbDownStreak = 0

    const alerts: Alert[] = []
    if (depths.deliveryQueue > 0 && (depths.oldestDeliveryS ?? 0) > STALE_QUEUE_S) {
      alerts.push({
        condition: 'delivery_stale',
        text: `Очередь доставки стоит: ${depths.deliveryQueue} неотправленных, старейшая ${minutes(depths.oldestDeliveryS)} мин.`,
      })
    }
    if (depths.photoQueue > PHOTO_QUEUE_ALERT || (depths.photoQueue > 0 && (depths.oldestPhotoS ?? 0) > STALE_QUEUE_S)) {
      alerts.push({
        condition: 'photo_queue',
        text: `Очередь фото: ${depths.photoQueue} в обработке, старейшая ${minutes(depths.oldestPhotoS)} мин. Воркер не справляется или встал.`,
      })
    }
    if (depths.photoFailed > 0) {
      alerts.push({
        condition: 'photo_failed',
        text: `Не обработано после пяти попыток: ${depths.photoFailed} фото.`,
      })
    }
    if (depths.moderationQueue > MODERATION_QUEUE_ALERT) {
      alerts.push({
        condition: 'moderation_queue',
        text: `Очередь модерации: ${depths.moderationQueue} заявок в NEW. Людей не хватает — пора включать пакетные действия.`,
      })
    }
    return alerts
  }

  private async telegramAlerts(): Promise<Alert[]> {
    return webhookAlerts(await this.webhook.state())
  }

  private async send(alerts: Alert[]): Promise<void> {
    if (this.chatId === null) return
    const text = ['⚠️ RavonRoad', ...alerts.map((alert) => `• ${alert.text}`)].join('\n')
    try {
      await this.bot.sendMessage({ chat_id: this.chatId, text, link_preview_options: { is_disabled: true } })
      logEvent('warn', 'alert_sent', { count: alerts.length, condition: alerts.map((a) => a.condition).join(',') })
    } catch (error) {
      // Известное и принятое слабое место: недоступный Telegram уносит с собой и алерт
      // о своей недоступности. Второй канал — внешний uptime-пинг на `/health`.
      logEvent('error', 'alert_send_failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }
}

function minutes(seconds: number | null): number {
  return Math.floor((seconds ?? 0) / 60)
}
