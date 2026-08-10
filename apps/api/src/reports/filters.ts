import { isPublicStatus, type PublicStatus } from '@ravonroad/shared-types'

/** Разбор фильтров списка и карты (SRS §4.3). Один разбор на оба маршрута: один и тот же
 *  фильтр обязан давать один и тот же набор заявок и в списке, и на карте (US-003). */
export interface ReportFilters {
  /** Пусто — все публичные статусы. `REJECTED` и `DUPLICATE` сюда не попадают никогда. */
  statuses: PublicStatus[]
  category: string | null
  district: string | null
  from: Date | null
  to: Date | null
  dateField: 'created' | 'done'
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number } | null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function date(value: unknown): Date | null {
  const raw = text(value)
  if (raw === null) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function bbox(value: unknown): ReportFilters['bbox'] {
  const parts = (text(value) ?? '').split(',').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null
  const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number]
  return { minLon, minLat, maxLon, maxLat }
}

/** Негодное значение отбрасывается, а не отвечает `400`: координатор получал бы ошибку
 *  на безобидную опечатку в ссылке, которую сам же и переслал в группу (SRS §4.3).
 *  Явный `status=REJECTED` по той же причине просто ничего не добавляет к выборке. */
export function parseFilters(query: Record<string, unknown>): ReportFilters {
  const statuses = (text(query['status']) ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(isPublicStatus)

  return {
    statuses,
    category: text(query['category']),
    district: text(query['district']),
    from: date(query['from']),
    to: date(query['to']),
    dateField: text(query['dateField']) === 'done' ? 'done' : 'created',
    bbox: bbox(query['bbox']),
  }
}

export interface FilterableReport {
  status: PublicStatus
  categoryCode: string
  districtCode: string
  longitude: number
  latitude: number
  createdAt: Date
  doneAt: Date | null
}

/** Тот же фильтр в памяти — для карты: её набор точек лежит в процессе целиком,
 *  и обращаться к БД на каждый сдвиг карты незачем (SRS §4.7). */
export function matchesFilters(report: FilterableReport, filters: ReportFilters): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.includes(report.status)) return false
  if (filters.category !== null && report.categoryCode !== filters.category) return false
  if (filters.district !== null && report.districtCode !== filters.district) return false

  const at = filters.dateField === 'done' ? report.doneAt : report.createdAt
  // Выборка «выполнено за период» (US-033) не должна включать невыполненное.
  if (filters.dateField === 'done' && at === null) return false
  if (at !== null && filters.from !== null && at < filters.from) return false
  if (at !== null && filters.to !== null && at > filters.to) return false

  const area = filters.bbox
  if (area === null) return true
  return (
    report.longitude >= area.minLon &&
    report.longitude <= area.maxLon &&
    report.latitude >= area.minLat &&
    report.latitude <= area.maxLat
  )
}
