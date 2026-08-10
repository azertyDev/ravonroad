import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { HealthController } from './health.controller'
import type { HealthService } from './health.service'

function controllerWith(databaseUp: boolean): HealthController {
  const health = { uptimeS: () => 42, isDatabaseUp: () => Promise.resolve(databaseUp) }
  return new HealthController(health as unknown as HealthService)
}

describe('HealthController', () => {
  it('отдаёт 200 независимо от состояния БД', () => {
    expect(controllerWith(false).getHealth()).toEqual({ status: 'ok', uptimeS: 42 })
  })

  it('отдаёт db: up, когда БД отвечает', async () => {
    await expect(controllerWith(true).getReady()).resolves.toEqual({ db: 'up' })
  })

  it('отдаёт 503 {"db":"down"}, когда БД молчит', async () => {
    await expect(controllerWith(false).getReady()).rejects.toMatchObject({
      status: 503,
      response: { db: 'down' },
    })
    await expect(controllerWith(false).getReady()).rejects.toBeInstanceOf(ServiceUnavailableException)
  })
})
