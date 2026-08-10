import { describe, expect, it } from 'vitest'
import type { PrismaService } from '../prisma/prisma.service'
import { HealthService, withTimeout } from './health.service'

/** Подделка вместо живой БД: проверяются ветки готовности, а не драйвер Postgres.
 *  Поведение при реально остановленном контейнере `db` проверяется на docker compose. */
function serviceWith(queryRaw: () => Promise<unknown>): HealthService {
  return new HealthService({ $queryRaw: queryRaw } as unknown as PrismaService)
}

describe('withTimeout', () => {
  it('пропускает результат, если операция успела', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
  })

  it('отклоняет зависшую операцию', async () => {
    await expect(withTimeout(new Promise(() => {}), 1)).rejects.toThrow(/timed out/)
  })
})

describe('HealthService', () => {
  it('считает БД поднятой, когда SELECT 1 отвечает', async () => {
    await expect(serviceWith(() => Promise.resolve([{ '?column?': 1 }])).isDatabaseUp()).resolves.toBe(true)
  })

  it('считает БД лежащей, когда соединение отвергнуто', async () => {
    await expect(serviceWith(() => Promise.reject(new Error('ECONNREFUSED'))).isDatabaseUp()).resolves.toBe(false)
  })

  it('считает БД лежащей, когда запрос не уложился в таймаут', async () => {
    await expect(serviceWith(() => new Promise(() => {})).isDatabaseUp()).resolves.toBe(false)
  }, 5000)

  it('отдаёт uptime в целых секундах', () => {
    const uptime = serviceWith(() => Promise.resolve([])).uptimeS()
    expect(Number.isInteger(uptime)).toBe(true)
    expect(uptime).toBeGreaterThanOrEqual(0)
  })
})
