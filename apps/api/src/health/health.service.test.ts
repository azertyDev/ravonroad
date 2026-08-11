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
  }, 9000)

  it('называет базу slow, когда она ответила со второй попытки', async () => {
    // Насыщенный пул: первое ожидание соединения не уложилось в две секунды, второе
    // уложилось. Это «занята», а не «мертва», и объявлять её лежащей нельзя —
    // именно так монитор врал на стенде.
    let attempt = 0
    const service = serviceWith(() => {
      attempt += 1
      return attempt === 1 ? new Promise(() => {}) : Promise.resolve([{ ok: 1 }])
    })
    await expect(service.probeDatabase()).resolves.toBe('slow')
  }, 9000)

  it('slow не выключает готовность', async () => {
    let attempt = 0
    const service = serviceWith(() => {
      attempt += 1
      return attempt === 1 ? Promise.reject(new Error('pool timeout')) : Promise.resolve([{ ok: 1 }])
    })
    await expect(service.isDatabaseUp()).resolves.toBe(true)
  })

  it('объявляет базу лежащей только после двух неудач подряд', async () => {
    let attempts = 0
    const service = serviceWith(() => {
      attempts += 1
      return Promise.reject(new Error('ECONNREFUSED'))
    })
    await expect(service.probeDatabase()).resolves.toBe('down')
    expect(attempts).toBe(2)
  })

  it('отдаёт uptime в целых секундах', () => {
    const uptime = serviceWith(() => Promise.resolve([])).uptimeS()
    expect(Number.isInteger(uptime)).toBe(true)
    expect(uptime).toBeGreaterThanOrEqual(0)
  })
})
