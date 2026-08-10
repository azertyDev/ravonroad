import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import type { HealthResponse, ReadyResponse } from '@ravonroad/shared-types'
import { HealthService } from './health.service'

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** Отвечает 200, пока процесс жив: остановленная БД не должна выключать контейнер. */
  @Get('health')
  getHealth(): HealthResponse {
    return { status: 'ok', uptimeS: this.health.uptimeS() }
  }

  @Get('ready')
  async getReady(): Promise<ReadyResponse> {
    if (await this.health.isDatabaseUp()) return { db: 'up' }
    // Тело исключения возвращается как есть — 503 {"db":"down"} из SRS §10.1.
    const body: ReadyResponse = { db: 'down' }
    throw new ServiceUnavailableException(body)
  }
}
