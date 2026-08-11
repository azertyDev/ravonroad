import { Controller, Get, HttpStatus, Param, Query, Req } from '@nestjs/common'
import {
  PUBLIC_STATUSES,
  type ReportDetail,
  type ReportListResponse,
  type ReportMapPoint,
  type ReportMapResponse,
} from '@ravonroad/shared-types'
import type { IncomingMessage } from 'node:http'
import { ApiException } from '../common/api-error'
import { clientIp } from '../common/client-ip'
import { RATE_LIMITS, rateLimitKey, RateLimiter } from '../common/rate-limit'
import { PointsCache } from '../stats/points-cache'
import { matchesFilters, parseFilters } from './filters'
import { PublicReportsService } from './public-reports.service'

/** Жёсткий потолок ответа карты (SRS §3.4): даже при ошибке в фильтрах клиент
 *  не получит больше, а UI попросит приблизить карту. */
const MAP_LIMIT = 5000

@Controller('reports')
export class PublicReportsController {
  constructor(
    private readonly reports: PublicReportsService,
    private readonly points: PointsCache,
    private readonly limiter: RateLimiter,
  ) {}

  /** SRS §9.5. Ключ общий на карту и список: у обоих законная нагрузка на человека —
   *  десятки запросов, и порог берётся на порядок выше. */
  private guard(request: IncomingMessage): void {
    const address = clientIp(request)
    if (address === null) return
    const verdict = this.limiter.hit(rateLimitKey('read', address), RATE_LIMITS.read)
    if (!verdict.allowed) {
      throw new ApiException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, 'too many read requests', {
        headers: { 'Retry-After': String(verdict.retryAfterS) },
      })
    }
  }

  /** Объявлен до `:number`: Nest сопоставляет маршруты в порядке объявления,
   *  и иначе `/reports/map` ушёл бы в карточку с номером «map». */
  @Get('map')
  async map(@Query() query: Record<string, unknown>, @Req() request: IncomingMessage): Promise<ReportMapResponse> {
    this.guard(request)
    const filters = parseFilters(query)
    const snapshot = await this.points.get()

    const points: ReportMapPoint[] = []
    let truncated = false
    for (const row of snapshot.rows) {
      if (!matchesFilters(row, filters)) continue
      if (points.length === MAP_LIMIT) {
        truncated = true
        break
      }
      points.push([row.longitude, row.latitude, PUBLIC_STATUSES.indexOf(row.status), row.number])
    }

    return { points, statuses: [...PUBLIC_STATUSES], truncated }
  }

  @Get()
  list(@Query() query: Record<string, unknown>, @Req() request: IncomingMessage): Promise<ReportListResponse> {
    this.guard(request)
    const limit = Number(query['limit'])
    return this.reports.list(
      parseFilters(query),
      typeof query['cursor'] === 'string' && query['cursor'] !== '' ? query['cursor'] : null,
      Number.isFinite(limit) ? limit : null,
    )
  }

  @Get(':number')
  detail(@Param('number') raw: string): Promise<ReportDetail> {
    const number = Number(raw)
    // Номер не из цифр отвечает тем же `404`, что и снятая с публикации заявка:
    // различать их значило бы подтверждать существование (SRS §9.2).
    if (!Number.isInteger(number) || number <= 0) {
      throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND, 'report is not published')
    }
    return this.reports.detail(number)
  }
}
