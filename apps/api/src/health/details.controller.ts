import { Controller, Get } from '@nestjs/common'
import { queueDepths } from '../common/queue-depths'
import { S3Service } from '../media/s3.service'
import { PrismaService } from '../prisma/prisma.service'
import { WebhookHealthService, type WebhookState } from '../telegram/webhook-health.service'
import { HealthService, type DbState } from './health.service'

/** Диагностическая сводка (SRS §10.1): что именно сломалось, когда `/ready` уже сказал,
 *  что сломалось хоть что-то.
 *
 *  Секретов и персональных данных здесь нет, поэтому страница доступна без авторизации:
 *  заводить единственный в системе секрет ради диагностики несоразмерно (SRS §10.1).
 *  Лимита у эндпоинта тоже нет и он не нужен (SRS §9.5): внешние проверки кэшируются
 *  на 60 секунд, а всё, что остаётся, — один запрос к БД из подзапросов по счётчикам.
 *
 *  `/ready` намеренно не смотрит ни на S3, ни на Telegram: чужой сбой не должен выключать
 *  работающий сервис. Их состояние видно **здесь** — и только здесь. */
const PROBE_CACHE_MS = 60_000

/** `null` означает «прочитать не удалось», а не ноль: БД лежит — числа взять неоткуда,
 *  и подставлять вместо них цифру нельзя. Числовая заглушка вроде `-1` однажды попадёт
 *  на график как настоящее значение. */
interface QueueSummary {
  photo: number | null
  delivery: number | null
  moderation: number | null
  photoFailed: number | null
  oldestPhotoS: number | null
  oldestDeliveryS: number | null
}

export interface HealthDetails {
  status: 'ok' | 'degraded'
  uptimeS: number
  /** `slow` — ответила только со второй попытки: занята, а не мертва (SRS §10.1). */
  db: DbState
  /** Кэш 60 с: страница диагностики не должна сама стать нагрузкой на хранилище. */
  s3: 'up' | 'down'
  telegram: WebhookState
  queues: QueueSummary
  /** Секунды с последнего обработанного апдейта; `null` — апдейтов не было вовсе.
   *  Тишина в webhook неотличима от «в группе ничего не происходит» (SRS §10.4),
   *  поэтому число само по себе ничего не доказывает — оно даёт человеку контекст. */
  lastUpdateAgeS: number | null
}

interface Cached<T> {
  at: number
  value: T
}

@Controller('health')
export class HealthDetailsController {
  private s3Probe: Cached<boolean> | null = null

  constructor(
    private readonly health: HealthService,
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly webhook: WebhookHealthService,
  ) {}

  @Get('details')
  async getDetails(): Promise<HealthDetails> {
    const [db, s3Up, telegram] = await Promise.all([
      this.health.probeDatabase(),
      this.s3Reachable(),
      this.webhook.state(),
    ])
    const dbUp = db !== 'down'

    // Очереди и возраст апдейта читаются из той же БД: она лежит — читать нечего,
    // и притворяться нулями было бы враньём в самом заметном месте.
    const queues = dbUp ? await queueDepths(this.prisma) : null
    const lastUpdateAgeS = dbUp ? await this.lastUpdateAgeS() : null

    return {
      status: db === 'up' && s3Up && telegram.webhook === 'ok' ? 'ok' : 'degraded',
      uptimeS: this.health.uptimeS(),
      db,
      s3: s3Up ? 'up' : 'down',
      telegram,
      queues: {
        photo: queues?.photoQueue ?? null,
        delivery: queues?.deliveryQueue ?? null,
        moderation: queues?.moderationQueue ?? null,
        photoFailed: queues?.photoFailed ?? null,
        oldestPhotoS: queues?.oldestPhotoS ?? null,
        oldestDeliveryS: queues?.oldestDeliveryS ?? null,
      },
      lastUpdateAgeS,
    }
  }

  private async s3Reachable(): Promise<boolean> {
    const now = Date.now()
    if (this.s3Probe !== null && now - this.s3Probe.at < PROBE_CACHE_MS) return this.s3Probe.value
    const value = await this.s3.bucketReachable()
    this.s3Probe = { at: now, value }
    return value
  }

  private async lastUpdateAgeS(): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ age_s: number | null }[]>`
      SELECT extract(epoch FROM now() - max(created_at))::int AS age_s FROM processed_update`
    return row?.age_s ?? null
  }
}
