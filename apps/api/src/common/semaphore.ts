/** Ограничитель одновременных запросов на приёме заявок (SRS §4.2, §5.7).
 *
 *  Порог выведен из **памяти**, а не из процессора: тело запроса живёт в буфере
 *  до отправки в S3, поэтому 8 × 8 МБ = 64 МБ — верхняя граница, типичное значение
 *  8 × 1 МБ. На dev с его 1 ГБ пропусков два, а не восемь (SRS §12.2).
 *
 *  Это единственный жёсткий отказ на пути подачи заявки, и он про исчерпание ресурса,
 *  а не про подозрительность отправителя. Очередь обработки фотографий заявку
 *  не отклоняет никогда — она растёт строками в таблице (ADR-0007). */
export class SemaphoreTimeoutError extends Error {
  constructor(waitedMs: number) {
    super(`no permit within ${waitedMs}ms`)
    this.name = 'SemaphoreTimeoutError'
  }
}

interface Waiter {
  resolve: () => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class Semaphore {
  private free: number
  private readonly waiting: Waiter[] = []

  constructor(permits: number) {
    this.free = permits
  }

  /** Ждёт пропуск не дольше `timeoutMs`, затем бросает `SemaphoreTimeoutError`.
   *  Ожидание в очереди — FIFO: девятый запрос пропускают раньше десятого, иначе
   *  под нагрузкой кто-то ждёт неограниченно долго. */
  acquire(timeoutMs: number): Promise<void> {
    if (this.free > 0) {
      this.free -= 1
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiting.indexOf(waiter)
          if (index >= 0) this.waiting.splice(index, 1)
          reject(new SemaphoreTimeoutError(timeoutMs))
        }, timeoutMs),
      }
      this.waiting.push(waiter)
    })
  }

  release(): void {
    const next = this.waiting.shift()
    if (next === undefined) {
      this.free += 1
      return
    }
    // Пропуск передаётся ожидающему напрямую: вернуть его в счётчик и разбудить
    // очередь значило бы дать вклиниться запросу, пришедшему позже.
    clearTimeout(next.timer)
    next.resolve()
  }
}
