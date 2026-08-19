import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { logEvent } from '../common/logger'
import { logQueueDepths, queueDepths } from '../common/queue-depths'
import { PrismaService } from '../prisma/prisma.service'
import { ProcessService } from './process.service'
import { PhotoStorage } from './photo-storage'

/** Очередь опрашивается раз в секунду. `LISTEN/NOTIFY` убрал бы эту задержку, но добавил
 *  бы выделенное соединение и обработку переподключений; при цели «превью через несколько
 *  секунд» секунда не стоит такого кода (ADR-0007). */
const POLL_INTERVAL_MS = 1000

/** Задача, взятая в работу, прячется на пять минут. В SRS §5.4 этого шага нет, и без него
 *  свойство «одна задача не выдаётся двум проходам» держится только на том, что воркер
 *  один: строка остаётся `PENDING`, транзакция захвата коммитится сразу, и следующий
 *  опрос через секунду взял бы её снова. Аренда делает свойство верным при любом числе
 *  воркеров, а цена — отложенный на пять минут повтор после падения процесса. */
const LEASE_MS = 5 * 60 * 1000

/** Ошибка → повтор, после пятой попытки фото уходит в `FAILED` (SRS §5.4).
 *  `FAILED` — терминальное состояние **фотографии**, но не заявки: заявка остаётся
 *  видимой с меньшим числом фотографий. Потерять заявку из-за неудачного ресайза нельзя. */
const BACKOFF_MS = [5_000, 30_000, 5 * 60_000, 30 * 60_000]
const MAX_ATTEMPTS = 5
/** Глубины очередей пишутся не чаще раза в минуту. Проход идёт раз в секунду, и строка
 *  на каждый дала бы 86 400 записей в сутки при потолке 30 МБ на контейнер логов
 *  (SRS §12.2 п.5) — числа при этом не устареют: очередь меняется медленнее, чем раз
 *  в минуту её читают. */
const DEPTH_LOG_INTERVAL_MS = 60_000

/** Сироты в `incoming/` подметаются раз в час, старше суток. Раньше это делало
 *  lifecycle-правило бакета одной строкой конфигурации; с переездом на диск правило
 *  исчезло вместе с бакетом, и сборщик пришлось написать (ADR-0009).
 *
 *  Сутки, а не час: сырой файл живёт минуты, но повтор после падения процесса отложен
 *  на пять минут аренды, а при пяти попытках с backoff последняя приходится почти
 *  на час. Подмести файл, за которым воркер ещё вернётся, — значит превратить
 *  восстановимую ошибку в потерянную фотографию. */
const SWEEP_INTERVAL_MS = 60 * 60 * 1000
const INCOMING_TTL_MS = 24 * 60 * 60 * 1000

interface ClaimedPhoto {
  id: number
  report_id: number
  raw_key: string | null
  attempts: number
}

@Injectable()
export class PhotoWorker implements OnModuleInit, OnModuleDestroy {
  private readonly timers: ReturnType<typeof setInterval>[] = []
  private readonly running = new Set<number>()
  private depthLoggedAt = 0

  constructor(
    private readonly prisma: PrismaService,
    private readonly process: ProcessService,
    private readonly storage: PhotoStorage,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const workers = this.config.get<number>('PHOTO_WORKERS') ?? 1
    for (let index = 0; index < workers; index += 1) {
      // Отказ прохода не должен ронять процесс: HTTP и обработка фотографий делят один
      // процесс, и недоступная на секунду БД — не повод перестать принимать заявки.
      // Без catch отклонённый промис здесь остаётся необработанным, а Node на таком
      // завершается: приём заявок падал бы вместе с воркером.
      const timer = setInterval(() => {
        this.tick(index).catch((error: unknown) => {
          logEvent('error', 'photo_worker_tick_failed', {
            error: error instanceof Error ? error.message : String(error),
          })
        })
      }, POLL_INTERVAL_MS)
      // Незавершённый таймер не должен держать процесс живым при остановке контейнера.
      timer.unref()
      this.timers.push(timer)
    }

    // Один на процесс, а не на воркер: подметать один каталог несколькими таймерами
    // незачем, и параллельные проходы гонялись бы за одними файлами.
    const sweeper = setInterval(() => {
      this.sweep().catch((error: unknown) => {
        logEvent('error', 'incoming_sweep_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }, SWEEP_INTERVAL_MS)
    sweeper.unref()
    this.timers.push(sweeper)
  }

  /** Публичный по той же причине, что `tick`: тест обязан уметь позвать проход сам,
   *  а не ждать час. Молчит, когда удалять нечего, — строка «удалено 0» раз в час
   *  съедала бы лог, в котором ищут отказы. */
  async sweep(): Promise<number> {
    const removed = await this.storage.sweepIncoming(INCOMING_TTL_MS)
    if (removed > 0) logEvent('warn', 'incoming_swept', { removed })
    return removed
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearInterval(timer)
    this.timers.length = 0
  }

  /** Один проход: взять задачу и обработать её. Публичный, потому что интеграционные
   *  тесты гоняют воркер шагами — ждать секундного таймера значило бы мерить сон. */
  async tick(slot = 0): Promise<boolean> {
    // Проход не наслаивается сам на себя: обработка длиннее секунды — норма, а не сбой.
    if (this.running.has(slot)) return false
    this.running.add(slot)
    try {
      if (Date.now() - this.depthLoggedAt >= DEPTH_LOG_INTERVAL_MS) {
        this.depthLoggedAt = Date.now()
        logQueueDepths(await queueDepths(this.prisma))
      }
      const photo = await this.claim()
      if (photo === null) return false
      await this.handle(photo)
      return true
    } finally {
      this.running.delete(slot)
    }
  }

  /** `FOR UPDATE SKIP LOCKED` — атомарный захват без двойной обработки и без нового
   *  механизма в системе: тот же приём, что у очереди доставки в Telegram (SRS §5.4).
   *
   *  `ORDER BY next_attempt_at` — FIFO по времени постановки. Приоритетов у фотографий
   *  нет: при всплеске справедливее обработать заявку, поданную первой, чем ту,
   *  у которой меньше файлов. */
  private async claim(): Promise<ClaimedPhoto | null> {
    const rows = await this.prisma.$queryRaw<ClaimedPhoto[]>`
      UPDATE report_photo
         SET attempts = attempts + 1,
             next_attempt_at = now() + ${LEASE_MS}::float8 * interval '1 millisecond'
       WHERE id = (SELECT id FROM report_photo
                    WHERE state = 'PENDING' AND next_attempt_at <= now()
                    ORDER BY next_attempt_at
                    LIMIT 1
                      FOR UPDATE SKIP LOCKED)
      RETURNING id, report_id, raw_key, attempts`
    return rows[0] ?? null
  }

  private async handle(photo: ClaimedPhoto): Promise<void> {
    if (photo.raw_key === null) {
      await this.fail(photo, 'photo has no raw object to process')
      return
    }

    try {
      const processed = await this.process.process(photo.raw_key)
      try {
        await this.prisma.reportPhoto.update({
          where: { id: photo.id },
          data: {
            state: 'READY',
            objectKey: processed.objectKey,
            previewKey: processed.previewKey,
            sha256: processed.sha256,
            width: processed.width,
            height: processed.height,
            bytes: processed.bytes,
            rawKey: null,
            lastError: null,
          },
        })
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        // Житель приложил один и тот же файл дважды. Совпадение выясняется только здесь:
        // `sha256` считается по итоговым байтам, и на приёме его ещё не существует.
        // Правильный исход — одна фотография, а не ошибка: строка-дубль удаляется,
        // а заявка остаётся с уже прикреплённым изображением (SRS §2.4).
        await this.prisma.reportPhoto.delete({ where: { id: photo.id } })
      }
      // Сырой объект больше не нужен. Не удалить его не страшно — lifecycle-правило
      // бакета чистит `incoming/` старше суток, — поэтому неудача здесь не откатывает
      // уже готовую фотографию.
      await this.storage.deleteObject(photo.raw_key).catch(() => undefined)
      await this.enqueueCard(photo.report_id)
    } catch (error) {
      await this.fail(photo, error instanceof Error ? error.message : 'unknown error')
    }
  }

  /** Карточка ставится в очередь, когда обработано **последнее** `BEFORE`-фото заявки
   *  (SRS §1.3 п.7): раньше в группу ушла бы карточка без фотографий, ради которых её
   *  и смотрят.
   *
   *  Один `INSERT ... SELECT` вместо чтения и проверки в коде: два воркера, дошедшие
   *  до последней фотографии одновременно, иначе поставили бы две карточки. Условие
   *  смотрит на `PENDING`, а не на `READY`, поэтому фотография, не пережившая пять
   *  попыток, карточку не задерживает — заявка уходит с оставшимися (T-074). */
  private async enqueueCard(reportId: number): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO telegram_outbox (report_id, kind, payload)
      SELECT ${reportId}, 'CARD_CREATE', '{}'::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM report_photo p
                          WHERE p.report_id = ${reportId} AND p.kind = 'BEFORE' AND p.state = 'PENDING')
         AND NOT EXISTS (SELECT 1 FROM telegram_outbox o
                          WHERE o.report_id = ${reportId} AND o.kind = 'CARD_CREATE')`
  }

  private async fail(photo: ClaimedPhoto, message: string): Promise<void> {
    const exhausted = photo.attempts >= MAX_ATTEMPTS
    const backoffMs = BACKOFF_MS[Math.min(photo.attempts - 1, BACKOFF_MS.length - 1)] ?? 0

    await this.prisma.reportPhoto.update({
      where: { id: photo.id },
      data: {
        state: exhausted ? 'FAILED' : 'PENDING',
        // Строка ошибки обрезается: колонка 500 символов, а стек PostGIS длиннее.
        lastError: message.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + backoffMs),
      },
    })
    // Последняя попытка исчерпана — фотографии не будет никогда, и ждать её карточке
    // больше незачем: заявка уходит в группу с оставшимися (T-074).
    if (exhausted) await this.enqueueCard(photo.report_id)
  }
}

/** Prisma не даёт типа для кода ошибки драйвера, а нужен ровно один: нарушение
 *  уникальности `photo_dedup_idx`. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}
