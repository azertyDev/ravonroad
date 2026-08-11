import { Injectable } from '@nestjs/common'
import { logEvent } from '../common/logger'
import { PrismaService } from '../prisma/prisma.service'

/** Таймаут SELECT 1 из SRS §10.1: зависшая БД обязана дать 503 за две секунды,
 *  а не держать проверку до таймаута самого клиента. */
const DB_PROBE_TIMEOUT_MS = 2000

/** `slow` — ответила со второй попытки: база занята, а не мертва. */
export type DbState = 'up' | 'slow' | 'down'

export async function withTimeout<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  uptimeS(): number {
    return Math.floor(process.uptime())
  }

  /** Вторая попытка отличает «занята» от «мертва». Таймаут в две секунды срабатывает
   *  не только на упавшей БД: при насыщенном пуле ожидание свободного соединения выглядит
   *  ровно так же. Одна неудачная проверка на холодном старте объявляла базу лежащей —
   *  наблюдалось на стенде, где `/ready` и запросы страниц при этом работали.
   *
   *  Монитор, который кричит «БД лежит» при живой БД, обесценивается за неделю, а потом
   *  молчит в настоящий сбой. Поэтому `db_unavailable` пишется только по итоговому
   *  вердикту, а не по каждой попытке. */
  async probeDatabase(): Promise<DbState> {
    if ((await this.ping()) === null) return 'up'
    const retry = await this.ping()
    if (retry === null) return 'slow'
    // Обязательное событие SRS §10.2. `/ready` отдаёт наружу только `{"db":"down"}`,
    // и без этой строки причина отказа не осталась бы нигде.
    logEvent('error', 'db_unavailable', { error: retry })
    return 'down'
  }

  /** `slow` — это `200`: медленная база остаётся рабочей, и выключать из-за неё сервис
   *  значило бы менять просадку на отказ. Заметна она в `/health/details`. */
  async isDatabaseUp(): Promise<boolean> {
    return (await this.probeDatabase()) !== 'down'
  }

  /** `null` — ответила; строка — текст отказа. */
  private async ping(): Promise<string | null> {
    try {
      await withTimeout(this.prisma.$queryRaw`SELECT 1`, DB_PROBE_TIMEOUT_MS)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
}
