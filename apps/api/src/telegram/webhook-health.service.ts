import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { BotApiClient } from './bot-api.client'

/** Активная проверка webhook (SRS §10.4).
 *
 *  Тишина в webhook неотличима от «в группе ничего не происходит», поэтому пассивное
 *  наблюдение здесь не работает: сброшенный чужим `setWebhook` адрес выглядит ровно как
 *  спокойный вечер. Единственный способ отличить одно от другого — спросить Telegram.
 *
 *  Ответ кэшируется на 60 секунд: `/health/details` и проверка алертов спрашивают одно
 *  и то же, и страница диагностики не должна превращаться в нагрузку на Bot API
 *  (SRS §10.1). Проверка алертов идёт раз в 5 минут — кэш ей не мешает. */
const CACHE_MS = 60_000

/** Ошибки моложе десяти минут — это ошибки сейчас, а не «когда-то в прошлом месяце». */
export const RECENT_ERROR_S = 600

/** Telegram копит апдейты — значит, мы их не забираем. */
export const MAX_PENDING_UPDATES = 20

export interface WebhookState {
  /** `unreachable` — не смогли спросить: это отказ Telegram, а не наш webhook. */
  webhook: 'ok' | 'missing' | 'foreign' | 'unreachable'
  pendingUpdates: number | null
  /** Секунды с последней ошибки, которую Telegram получил от нас; `null` — ошибок нет. */
  lastErrorAgeS: number | null
}

@Injectable()
export class WebhookHealthService {
  /** Адрес, который обязан стоять у Telegram. Знаем его точно, только если задан
   *  случайный сегмент пути; иначе сверяется происхождение — этого достаточно, чтобы
   *  отличить наш стенд от чужого `setWebhook`. */
  private readonly expectedUrl: string | null
  private readonly expectedOrigin: string
  private cached: { at: number; value: WebhookState } | null = null

  constructor(
    config: ConfigService,
    private readonly bot: BotApiClient,
  ) {
    this.expectedOrigin = config.getOrThrow<string>('WEB_ORIGIN').replace(/\/+$/, '')
    const path = config.get<string>('TELEGRAM_WEBHOOK_PATH')
    this.expectedUrl =
      path === undefined || path === '' ? null : `${this.expectedOrigin}/api/telegram/webhook/${path}`
  }

  async state(): Promise<WebhookState> {
    const now = Date.now()
    if (this.cached !== null && now - this.cached.at < CACHE_MS) return this.cached.value
    const value = await this.probe()
    this.cached = { at: now, value }
    return value
  }

  private async probe(): Promise<WebhookState> {
    let info
    try {
      info = await this.bot.getWebhookInfo()
    } catch {
      // Сам Telegram недоступен. Это отдельное состояние: объявлять webhook сброшенным
      // из-за сетевого отказа значило бы будить человека не по тому поводу.
      return { webhook: 'unreachable', pendingUpdates: null, lastErrorAgeS: null }
    }

    const lastErrorAgeS =
      info.last_error_date === undefined ? null : Math.max(0, Math.floor(Date.now() / 1000) - info.last_error_date)

    return {
      webhook: this.classify(info.url),
      pendingUpdates: info.pending_update_count,
      lastErrorAgeS,
    }
  }

  private classify(url: string): WebhookState['webhook'] {
    if (url === '') return 'missing'
    if (this.expectedUrl !== null) return url === this.expectedUrl ? 'ok' : 'foreign'
    return url.startsWith(`${this.expectedOrigin}/`) ? 'ok' : 'foreign'
  }
}

/** Условия алерта, которые даёт состояние webhook (SRS §10.4). Отдельно от отправки:
 *  так их видно списком и можно проверить без Telegram на другом конце. */
export function webhookAlerts(state: WebhookState): { condition: string; text: string }[] {
  const alerts: { condition: string; text: string }[] = []
  if (state.webhook === 'missing') {
    alerts.push({ condition: 'webhook_missing', text: 'Webhook сброшен: у Telegram пустой url. Модерация стоит.' })
  }
  if (state.webhook === 'foreign') {
    alerts.push({ condition: 'webhook_foreign', text: 'Webhook уводит апдейты на чужой адрес.' })
  }
  if (state.pendingUpdates !== null && state.pendingUpdates > MAX_PENDING_UPDATES) {
    alerts.push({
      condition: 'webhook_pending',
      text: `Telegram копит апдейты: ${state.pendingUpdates} в очереди — мы их не забираем.`,
    })
  }
  if (state.lastErrorAgeS !== null && state.lastErrorAgeS < RECENT_ERROR_S) {
    alerts.push({
      condition: 'webhook_errors',
      text: `Telegram получает от нас ошибки: последняя ${state.lastErrorAgeS} с назад.`,
    })
  }
  return alerts
}
