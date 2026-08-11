import { HttpStatus, Injectable } from '@nestjs/common'
import { PUBLIC_STATUSES, type PublicStatus } from '@ravonroad/shared-types'
import { ApiException } from '../common/api-error'
import type { FilterableReport } from '../reports/filters'
import { PrismaService } from '../prisma/prisma.service'
import { summarize, type CampaignSummary } from './summary'

/** Тридцать секунд — потолок задержки счётчика вдвое ниже требования PRD (≤ 60 с)
 *  и ровно столько же, сколько живёт микрокэш nginx (SRS §4.7).
 *
 *  Значение переопределяется `POINTS_CACHE_TTL_MS` и обнуляется в тестах: снимок живёт
 *  дольше, чем идёт тест, и проверить свежие данные через HTTP иначе нельзя вовсе —
 *  ответ приходил бы от предыдущего сценария. Это не поблажка тестам, а недостающая
 *  ручка: на проде ей же снижается задержка счётчика, если 30 секунд окажутся много. */
const DEFAULT_TTL_MS = 30_000

function ttlMs(): number {
  const raw = Number(process.env['POINTS_CACHE_TTL_MS'])
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_TTL_MS
}

export interface PointRow extends FilterableReport {
  number: number
}

interface Snapshot {
  rows: PointRow[]
  /** Числа плаката целиком, посчитанные тем же проходом, что и точки. */
  summary: CampaignSummary
  at: number
}

/** Весь набор публичных точек города целиком, одной записью в памяти процесса (SRS §4.7).
 *
 *  Не по bbox: ключей бесконечно много, и кэш выродился бы в промахи. Поэтому набор
 *  держится целиком, а bbox и фильтры применяются в памяти — на 10 000 точек это
 *  микросекунды и ни одного обращения к БД. Тем же проходом считается счётчик `DONE`,
 *  поэтому он выполняется дважды в минуту независимо от числа посетителей.
 *
 *  Потолок — примерно 10⁵ точек, то есть тот же, что у клиентской кластеризации (SRS §3.4),
 *  и та же замена: серверная агрегация по сетке. До цели кампании запас десятикратный. */
@Injectable()
export class PointsCache {
  private snapshot: Snapshot | null = null
  private loading: Promise<Snapshot> | null = null

  constructor(private readonly prisma: PrismaService) {}

  async get(now: number = Date.now()): Promise<Snapshot> {
    const current = this.snapshot
    if (current !== null && now - current.at < ttlMs()) return current

    // Single-flight: сотня одновременных запросов при истёкшем TTL уходит в БД одним.
    // Без этого истечение кэша под нагрузкой отправляло бы в базу столько запросов,
    // сколько пришло, — то есть ровно в момент всплеска (SRS §12.3 п.5).
    this.loading ??= this.load(now).finally(() => {
      this.loading = null
    })

    try {
      return await this.loading
    } catch {
      // Просроченный набор лучше пустой карты: посетитель решит, что кампания мертва.
      if (current !== null) return current
      // Кэш пуст и БД недоступна — `503`, а не пустой массив: пустая карта и сломанная
      // карта обязаны различаться (SRS §4.7, §8.2).
      throw new ApiException('INTERNAL_ERROR', HttpStatus.SERVICE_UNAVAILABLE, 'report snapshot is unavailable', {
        headers: { 'Retry-After': '5' },
      })
    }
  }

  private async load(now: number): Promise<Snapshot> {
    const reports = await this.prisma.report.findMany({
      where: { status: { in: [...PUBLIC_STATUSES] } },
      select: {
        publicNumber: true,
        status: true,
        latitude: true,
        longitude: true,
        category: { select: { code: true } },
        districtCode: true,
        createdAt: true,
        doneAt: true,
      },
    })

    const rows = reports.map((report) => ({
      number: report.publicNumber,
      status: report.status as PublicStatus,
      latitude: report.latitude.toNumber(),
      longitude: report.longitude.toNumber(),
      categoryCode: report.category.code,
      districtCode: report.districtCode,
      createdAt: report.createdAt,
      doneAt: report.doneAt,
    }))

    const snapshot = { rows, summary: summarize(rows, now), at: now }
    this.snapshot = snapshot
    return snapshot
  }
}
