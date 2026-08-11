import { Injectable } from '@nestjs/common'

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

export interface RateLimitRule {
  limit: number
  windowMs: number
}

/** Ключ окна — маршрут **и** адрес. Один общий счётчик на процесс, поэтому без префикса
 *  открытие формы тратило бы лимит подачи заявок: правила разные, а адрес один. */
export function rateLimitKey(scope: string, clientIp: string): string {
  return `${scope}:${clientIp}`
}

/** Пороги SRS §9.5. Жёсткий лимит ставится только там, где законная нагрузка на одного
 *  человека равна примерно единице, и берётся на порядок выше: за CGNAT один адрес — это
 *  сотни независимых людей, и жёсткая мера отрезает район, а не нарушителя (PRD §10.4).
 *
 *  Отсюда два порога на подачу заявки: 10/час — это флаг «проверить», а 60/час — барьер
 *  против исчерпания ресурса, а не суждение о добросовестности отправителя. */
export const RATE_LIMITS = {
  /** Мягкий: заявка создаётся и получает сигнал `IP_RATE` (PRD §10.4). */
  reportsSoft: { limit: 10, windowMs: HOUR_MS },
  /** Жёсткий: `429`. Единственный отказ по адресу во всей системе. */
  reportsHard: { limit: 60, windowMs: HOUR_MS },
  formOpens: { limit: 60, windowMs: HOUR_MS },
  /** Единственная защита от перебора токенов; законный владелец ссылки
   *  не делает и десяти запросов (SRS §9.5). Используется страницей отслеживания в 003. */
  track: { limit: 30, windowMs: MINUTE_MS },
  /** Карта и список: порог выше любого ручного использования. При всплеске до api
   *  доходит один запрос в 30 секунд на ключ — остальное отдаёт микрокэш nginx (§4.7),
   *  поэтому лимит защищает от нецелевого использования, а не от посетителей (§9.5). */
  read: { limit: 300, windowMs: MINUTE_MS },
} as const satisfies Record<string, RateLimitRule>

/** Сверх этого числа ключей карта подметается целиком. Порог не про точность, а про то,
 *  чтобы память не росла от адресов, которые больше никогда не вернутся. */
const SWEEP_THRESHOLD = 10_000

export interface RateLimitVerdict {
  /** Сколько попаданий в окне, включая текущее. */
  count: number
  /** `false` — порог правила превышен. */
  allowed: boolean
  /** Секунды до освобождения места в окне; для заголовка `Retry-After`. */
  retryAfterS: number
}

/** Скользящее окно в памяти процесса. Redis не заводится: процесс один (SRS §9.5).
 *
 *  Потолок решения назван там же: при появлении второго экземпляра лимиты станут
 *  per-instance, и потребуется либо sticky-балансировка, либо общее хранилище счётчиков. */
@Injectable()
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()

  /** Регистрирует попадание и возвращает вердикт по правилу.
   *
   *  Окно скользящее, а не календарное: у календарного нарушитель получает двойной
   *  лимит на стыке часов, просто подождав минуту.
   *
   *  **Отклонённая попытка в окно не записывается.** Иначе скрипт, долбящий эндпоинт,
   *  продлевал бы запрет себе сам — и, за CGNAT, всему дому вместе с собой, ещё на час
   *  после того, как перестал (SRS §9.5). Порог означает «столько обслужили за час»,
   *  а не «столько раз постучали».
   *
   *  `count` — номер попытки в окне, включая текущую: по нему ставится мягкий флаг,
   *  и он остаётся осмысленным, даже когда жёсткий порог уже отказал. */
  hit(key: string, rule: RateLimitRule, now: number = Date.now()): RateLimitVerdict {
    const since = now - rule.windowMs
    const kept = (this.hits.get(key) ?? []).filter((at) => at > since)
    const count = kept.length + 1
    const allowed = count <= rule.limit
    if (allowed) kept.push(now)
    this.hits.set(key, kept)

    if (this.hits.size > SWEEP_THRESHOLD) this.sweep(now, rule.windowMs)

    const oldest = kept[0] ?? now
    return {
      count,
      allowed,
      retryAfterS: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / SECOND_MS)),
    }
  }

  private sweep(now: number, windowMs: number): void {
    const since = now - windowMs
    for (const [key, timestamps] of this.hits) {
      const kept = timestamps.filter((at) => at > since)
      if (kept.length === 0) this.hits.delete(key)
      else this.hits.set(key, kept)
    }
  }
}
