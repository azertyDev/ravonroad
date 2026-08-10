import { describe, expect, it } from 'vitest'
import { RATE_LIMITS, RateLimiter } from './rate-limit'

const RULE = { limit: 3, windowMs: 1000 }

describe('RateLimiter', () => {
  it('пропускает попадания до порога включительно и отклоняет следующее', () => {
    const limiter = new RateLimiter()
    expect([1, 2, 3].map((n) => limiter.hit('a', RULE, n).allowed)).toEqual([true, true, true])
    expect(limiter.hit('a', RULE, 4).allowed).toBe(false)
  })

  it('считает окно скользящим, а не календарным', () => {
    const limiter = new RateLimiter()
    for (const at of [1000, 1100, 1200]) limiter.hit('a', RULE, at)
    // Все три ещё в окне — четвёртое попадание отклоняется.
    expect(limiter.hit('a', RULE, 1999).allowed).toBe(false)
    // Через окно после первого попадания место освободилось. Здесь же проверяется, что
    // отклонённая попытка в 1999 в окно не попала: иначе она сдвинула бы освобождение
    // на секунду вперёд и запрет продлевал бы сам себя (SRS §9.5, CGNAT).
    expect(limiter.hit('a', RULE, 2001).allowed).toBe(true)
  })

  it('ведёт счёт по каждому адресу отдельно', () => {
    const limiter = new RateLimiter()
    for (const at of [1, 2, 3]) limiter.hit('a', RULE, at)
    expect(limiter.hit('a', RULE, 4).allowed).toBe(false)
    expect(limiter.hit('b', RULE, 4)).toEqual({ count: 1, allowed: true, retryAfterS: 1 })
  })

  it('возвращает счётчик, по которому ставится мягкий флаг', () => {
    const limiter = new RateLimiter()
    expect(limiter.hit('a', RULE, 1).count).toBe(1)
    expect(limiter.hit('a', RULE, 2).count).toBe(2)
    // Мягкий флаг ставится по счётчику, а жёсткий порог отказывает по нему же, поэтому
    // после отказа счётчик обязан остаться осмысленным, а не замереть на пороге.
    for (const at of [3, 4]) limiter.hit('a', RULE, at)
    expect(limiter.hit('a', RULE, 5).count).toBe(4)
  })

  it('говорит, через сколько секунд освободится место', () => {
    const limiter = new RateLimiter()
    const rule = { limit: 1, windowMs: 60_000 }
    limiter.hit('a', rule, 0)
    expect(limiter.hit('a', rule, 10_000).retryAfterS).toBe(50)
  })

  it('никогда не обещает повтор через ноль секунд', () => {
    // Retry-After: 0 клиент понимает как «прямо сейчас» и уходит в тесный цикл.
    const limiter = new RateLimiter()
    const rule = { limit: 1, windowMs: 100 }
    limiter.hit('a', rule, 0)
    expect(limiter.hit('a', rule, 99).retryAfterS).toBeGreaterThanOrEqual(1)
  })
})

describe('RATE_LIMITS (SRS §9.5)', () => {
  it('держит мягкий порог подачи ниже жёсткого', () => {
    // Иначе флаг «проверить» не успевал бы появиться: заявка отклонялась бы раньше.
    expect(RATE_LIMITS.reportsSoft.limit).toBeLessThan(RATE_LIMITS.reportsHard.limit)
    expect(RATE_LIMITS.reportsSoft.windowMs).toBe(RATE_LIMITS.reportsHard.windowMs)
  })

  it('резервирует 30 запросов в минуту на страницу отслеживания', () => {
    expect(RATE_LIMITS.track).toEqual({ limit: 30, windowMs: 60_000 })
  })
})
