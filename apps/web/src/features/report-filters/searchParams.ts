import { isPublicStatus } from '@ravonroad/shared-types'
import { EMPTY_FILTERS, type ReportFilters } from '../../entities/report/api'

/** Фильтры живут в search-параметрах URL, а не в состоянии React (SRS §7.3).
 *
 *  Ради двух вещей: ссылку на срез «район + статус» можно переслать в группу как план
 *  выезда (US-031), и «назад» в браузере возвращает предыдущий набор, а не сбрасывает его.
 *
 *  Отдельной библиотеки валидации здесь нет намеренно: разбор пяти параметров — это
 *  функция на тридцать строк, а мусорное значение отбрасывается, а не роняет страницу. */
export interface ReportSearch {
  status?: string
  category?: string
  district?: string
  from?: string
  to?: string
  dateField?: 'done'
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function day(value: unknown): string | undefined {
  const raw = text(value)
  return raw !== undefined && DATE.test(raw) && !Number.isNaN(Date.parse(raw)) ? raw : undefined
}

/** `validateSearch` маршрута: значение вне списка отбрасывается молча. Координатор,
 *  промахнувшийся мимо буквы в присланной ссылке, должен увидеть карту, а не ошибку. */
export function validateReportSearch(raw: Record<string, unknown>): ReportSearch {
  const statuses = (text(raw['status']) ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(isPublicStatus)

  return {
    ...(statuses.length > 0 ? { status: statuses.join(',') } : {}),
    ...(text(raw['category']) === undefined ? {} : { category: text(raw['category']) }),
    ...(text(raw['district']) === undefined ? {} : { district: text(raw['district']) }),
    ...(day(raw['from']) === undefined ? {} : { from: day(raw['from']) }),
    ...(day(raw['to']) === undefined ? {} : { to: day(raw['to']) }),
    // Единственное непустое значение поля даты: `created` — умолчание, и держать его
    // в адресе значит только удлинять ссылку.
    ...(text(raw['dateField']) === 'done' ? { dateField: 'done' as const } : {}),
  }
}

export function toFilters(search: ReportSearch): ReportFilters {
  return {
    status: (search.status ?? '').split(',').filter(isPublicStatus),
    category: search.category ?? null,
    district: search.district ?? null,
    from: search.from ?? null,
    to: search.to ?? null,
    dateField: search.dateField === 'done' ? 'done' : 'created',
  }
}

export function toSearch(filters: ReportFilters): ReportSearch {
  return validateReportSearch({
    status: filters.status.join(','),
    category: filters.category ?? undefined,
    district: filters.district ?? undefined,
    from: filters.from ?? undefined,
    to: filters.to ?? undefined,
    dateField: filters.dateField,
  })
}

export function isEmptyFilters(filters: ReportFilters): boolean {
  return (
    filters.status.length === 0 &&
    filters.category === null &&
    filters.district === null &&
    filters.from === null &&
    filters.to === null &&
    filters.dateField === EMPTY_FILTERS.dateField
  )
}
