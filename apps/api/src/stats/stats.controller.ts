import { Controller, Get } from '@nestjs/common'
import { CAMPAIGN_GOAL, type StatsResponse } from '@ravonroad/shared-types'
import { PointsCache } from './points-cache'

@Controller('stats')
export class StatsController {
  constructor(private readonly points: PointsCache) {}

  /** Счётчик считается из данных, а не хранится числом (инвариант PRD 5.3.2) — но берётся
   *  тем же проходом, что и точки карты, поэтому `COUNT` выполняется дважды в минуту
   *  независимо от числа посетителей (SRS §4.7). */
  @Get()
  async read(): Promise<StatsResponse> {
    const snapshot = await this.points.get()
    return { ...snapshot.summary, goal: CAMPAIGN_GOAL }
  }
}
