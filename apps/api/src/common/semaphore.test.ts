import { describe, expect, it, vi } from 'vitest'
import { Semaphore, SemaphoreTimeoutError } from './semaphore'

describe('Semaphore (SRS §4.2, §5.7)', () => {
  it('выдаёт пропуска до предела без ожидания', async () => {
    const semaphore = new Semaphore(2)
    await expect(Promise.all([semaphore.acquire(50), semaphore.acquire(50)])).resolves.toBeDefined()
  })

  it('заставляет ждать сверх предела и пропускает после release', async () => {
    const semaphore = new Semaphore(1)
    await semaphore.acquire(1000)

    let passed = false
    const waiting = semaphore.acquire(1000).then(() => {
      passed = true
    })
    await Promise.resolve()
    expect(passed).toBe(false)

    semaphore.release()
    await waiting
    expect(passed).toBe(true)
  })

  it('отказывает по таймауту, а не ждёт вечно', async () => {
    vi.useFakeTimers()
    try {
      const semaphore = new Semaphore(1)
      await semaphore.acquire(1000)
      const rejected = semaphore.acquire(20_000)
      vi.advanceTimersByTime(20_001)
      await expect(rejected).rejects.toBeInstanceOf(SemaphoreTimeoutError)
    } finally {
      vi.useRealTimers()
    }
  })

  it('соблюдает очередь: девятый проходит раньше десятого', async () => {
    const semaphore = new Semaphore(1)
    await semaphore.acquire(1000)

    const order: string[] = []
    const ninth = semaphore.acquire(1000).then(() => order.push('ninth'))
    const tenth = semaphore.acquire(1000).then(() => order.push('tenth'))

    semaphore.release()
    await ninth
    semaphore.release()
    await tenth

    expect(order).toEqual(['ninth', 'tenth'])
  })

  it('не отдаёт пропуск, отпущенный после того, как ожидающий сдался', async () => {
    vi.useFakeTimers()
    try {
      const semaphore = new Semaphore(1)
      await semaphore.acquire(1000)
      const abandoned = semaphore.acquire(100)
      vi.advanceTimersByTime(101)
      await expect(abandoned).rejects.toBeInstanceOf(SemaphoreTimeoutError)

      // Пропуск обязан вернуться в счётчик, а не уйти в отвалившегося ожидающего:
      // иначе после серии таймаутов приём встаёт навсегда.
      semaphore.release()
      await expect(semaphore.acquire(100)).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
