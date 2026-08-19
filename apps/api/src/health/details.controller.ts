import { Controller, Get } from '@nestjs/common'
import { queueDepths } from '../common/queue-depths'
import { PhotoStorage } from '../media/photo-storage'
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
 *  `/ready` намеренно не смотрит ни на хранилище, ни на Telegram: чужой сбой не должен
 *  выключать работающий сервис. Их состояние видно **здесь** — и только здесь. */
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
  /** Право записи в `MEDIA_ROOT`, кэш 60 с: страница диагностики не должна сама стать
   *  нагрузкой на диск. `down` — том только на чтение, чужой uid или кончившееся место
   *  (ADR-0009). */
  storage: 'up' | 'down'
  /** Свободное место под фотографиями, МБ; `null` — прочитать не удалось. С переездом
   *  снимков на диск это первый ресурс, который кончится: 15 ГБ при цели кампании
   *  в 10 000 ям, и кончается он тихо (SRS §12.2 п.5). */
  diskFreeMb: number | null
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
  private storageProbe: Cached<boolean> | null = null

  constructor(
    private readonly health: HealthService,
    private readonly prisma: PrismaService,
    private readonly storage: PhotoStorage,
    private readonly webhook: WebhookHealthService,
  ) {}

  @Get('details')
  async getDetails(): Promise<HealthDetails> {
    const [db, storageUp, diskFreeMb, telegram] = await Promise.all([
      this.health.probeDatabase(),
      this.storageWritable(),
      this.diskFreeMb(),
      this.webhook.state(),
    ])
    const dbUp = db !== 'down'

    // Очереди и возраст апдейта читаются из той же БД: она лежит — читать нечего,
    // и притворяться нулями было бы враньём в самом заметном месте.
    const queues = dbUp ? await queueDepths(this.prisma) : null
    const lastUpdateAgeS = dbUp ? await this.lastUpdateAgeS() : null

    return {
      status: db === 'up' && storageUp && telegram.webhook === 'ok' ? 'ok' : 'degraded',
      uptimeS: this.health.uptimeS(),
      db,
      storage: storageUp ? 'up' : 'down',
      diskFreeMb,
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

  private async storageWritable(): Promise<boolean> {
    const now = Date.now()
    if (this.storageProbe !== null && now - this.storageProbe.at < PROBE_CACHE_MS) {
      return this.storageProbe.value
    }
    const value = await this.storage.writable()
    this.storageProbe = { at: now, value }
    return value
  }

  /** Не кэшируется в отличие от пробы записи: чтение `statfs` не создаёт файлов
   *  и стоит один системный вызов. */
  private async diskFreeMb(): Promise<number | null> {
    const bytes = await this.storage.freeBytes()
    return bytes === null ? null : Math.round(bytes / 1024 / 1024)
  }

  private async lastUpdateAgeS(): Promise<number | null> {
    const [row] = await this.prisma.$queryRaw<{ age_s: number | null }[]>`
      SELECT extract(epoch FROM now() - max(created_at))::int AS age_s FROM processed_update`
    return row?.age_s ?? null
  }
}
