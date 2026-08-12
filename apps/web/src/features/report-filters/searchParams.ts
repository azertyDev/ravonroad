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
  /** Куда навести карту при открытии — не фильтр, а прицел: «показать на карте»
   *  со страницы заявки (Desktop C › экран 3). В набор заявок не входит и в `toFilters`
   *  не попадает, поэтому смена фильтра его не сохраняет: человек уже посмотрел. */
  lat?: number
  lon?: number
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Координата из адреса: только конечное число в пределах круга. Мусор отбрасывается
 *  молча — карта откроется на городе, а не на ошибке. */
function degrees(value: unknown, limit: number): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(text(value))
  return Number.isFinite(parsed) && Math.abs(parsed) <= limit ? parsed : undefined
}

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
    // Половина прицела бесполезна: без второй координаты наводить карту не на что.
    ...(degrees(raw['lat'], 90) === undefined || degrees(raw['lon'], 180) === undefined
      ? {}
      : { lat: degrees(raw['lat'], 90), lon: degrees(raw['lon'], 180) }),
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

/** Сколько фильтров включено — число на кнопке «Фильтры» (Desktop C › строка над картой).
 *  Статусы считаются поштучно: снимают их тоже по одному. Поле даты не считается —
 *  оно уточняет период, а само по себе ничего не отбирает. */
export function countFilters(filters: ReportFilters): number {
  return (
    filters.status.length +
    (filters.category === null ? 0 : 1) +
    (filters.district === null ? 0 : 1) +
    (filters.from === null ? 0 : 1) +
    (filters.to === null ? 0 : 1)
  )
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
