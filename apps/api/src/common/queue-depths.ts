import type { PrismaService } from '../prisma/prisma.service'
import { logEvent } from './logger'

/** Три глубины очередей и число провалов — числа, которые показывают всплеск раньше
 *  жалобы «а где мои фотки» (SRS §10.3). Считаются одним запросом, потому что читает их
 *  и воркер на каждом проходе, и `/health/details`, и проверка алертов: четыре round-trip
 *  вместо одного при бюджете 8 соединений — цена ни за что.
 *
 *  Возрасты старейших задач в событие `queue_depth` не попадают (SRS §10.3 требует
 *  четыре числа), но нужны алертам §10.4: очередь из двух записей, висящая полчаса,
 *  опаснее очереди из ста, которая разбирается. */
export interface QueueDepths {
  /** `report_photo.state = 'PENDING'` — очередь обработки фото. */
  photoQueue: number
  /** `telegram_outbox.sent_at IS NULL` — очередь доставки. */
  deliveryQueue: number
  /** `report.status = 'NEW'` — очередь модерации, метрика про людей. */
  moderationQueue: number
  /** `report_photo.state = 'FAILED'` — ресайз не прошёл после пяти попыток. */
  photoFailed: number
  /** Секунды; `null` — очередь пуста. */
  oldestPhotoS: number | null
  oldestDeliveryS: number | null
}

interface DepthRow {
  photo_queue: number
  delivery_queue: number
  moderation_queue: number
  photo_failed: number
  oldest_photo_s: number | null
  oldest_delivery_s: number | null
}

export async function queueDepths(prisma: PrismaService): Promise<QueueDepths> {
  const [row] = await prisma.$queryRaw<DepthRow[]>`
    SELECT (SELECT count(*) FROM report_photo WHERE state = 'PENDING')::int AS photo_queue,
           (SELECT count(*) FROM telegram_outbox WHERE sent_at IS NULL)::int AS delivery_queue,
           (SELECT count(*) FROM report WHERE status = 'NEW')::int AS moderation_queue,
           (SELECT count(*) FROM report_photo WHERE state = 'FAILED')::int AS photo_failed,
           (SELECT extract(epoch FROM now() - min(created_at))::int
              FROM report_photo WHERE state = 'PENDING') AS oldest_photo_s,
           (SELECT extract(epoch FROM now() - min(created_at))::int
              FROM telegram_outbox WHERE sent_at IS NULL) AS oldest_delivery_s`
  return {
    photoQueue: row?.photo_queue ?? 0,
    deliveryQueue: row?.delivery_queue ?? 0,
    moderationQueue: row?.moderation_queue ?? 0,
    photoFailed: row?.photo_failed ?? 0,
    oldestPhotoS: row?.oldest_photo_s ?? null,
    oldestDeliveryS: row?.oldest_delivery_s ?? null,
  }
}

/** Событие `queue_depth` из SRS §10.3 — четыре числа, ради которых оно и заводилось. */
export function logQueueDepths(depths: QueueDepths): void {
  logEvent('info', 'queue_depth', {
    photoQueue: depths.photoQueue,
    deliveryQueue: depths.deliveryQueue,
    moderationQueue: depths.moderationQueue,
    photoFailed: depths.photoFailed,
  })
}
