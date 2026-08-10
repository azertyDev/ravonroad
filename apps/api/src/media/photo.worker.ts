import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../prisma/prisma.service'
import { ProcessService } from './process.service'
import { S3Service } from './s3.service'

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

interface ClaimedPhoto {
  id: number
  raw_key: string | null
  attempts: number
}

@Injectable()
export class PhotoWorker implements OnModuleInit, OnModuleDestroy {
  private readonly timers: ReturnType<typeof setInterval>[] = []
  private readonly running = new Set<number>()

  constructor(
    private readonly prisma: PrismaService,
    private readonly process: ProcessService,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const workers = this.config.get<number>('PHOTO_WORKERS') ?? 1
    for (let index = 0; index < workers; index += 1) {
      const timer = setInterval(() => void this.tick(index), POLL_INTERVAL_MS)
      // Незавершённый таймер не должен держать процесс живым при остановке контейнера.
      timer.unref()
      this.timers.push(timer)
    }
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
      RETURNING id, raw_key, attempts`
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
      await this.s3.deleteObject(photo.raw_key).catch(() => undefined)
    } catch (error) {
      await this.fail(photo, error instanceof Error ? error.message : 'unknown error')
    }
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
  }
}

/** Prisma не даёт типа для кода ошибки драйвера, а нужен ровно один: нарушение
 *  уникальности `photo_dedup_idx`. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}
