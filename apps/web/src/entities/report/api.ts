import type {
  CreateReportResponse,
  Locale,
  ReportDetail,
  ReportListResponse,
  ReportMapResponse,
  ReportStatus,
} from '@ravonroad/shared-types'
import { apiFetch } from '../../shared/api/client'

/** Ключи запросов — от общего к частному, чтобы инвалидация была точечной (SRS §7.5):
 *  отправка формы гасит `['reports']` целиком, а карточка обновляется сама по себе.
 *  Курсора в ключе списка нет намеренно: страницы копит `useInfiniteQuery` под одним
 *  ключом, и «показать ещё» не должно означать новый запрос уже показанного. */
export const reportKeys = {
  all: ['reports'] as const,
  map: (bbox: string, filters: ReportFilters) => ['reports', 'map', bbox, filters] as const,
  list: (filters: ReportFilters) => ['reports', 'list', filters] as const,
  detail: (number: number) => ['reports', 'detail', number] as const,
}

/** Поле даты, по которому фильтруется период: US-033 просит выборку выполненного
 *  за период, а не созданного. */
export const DATE_FIELDS = ['created', 'done'] as const

export type DateField = (typeof DATE_FIELDS)[number]

/** Набор фильтров, общий для карты и списка: один и тот же фильтр обязан давать
 *  один и тот же набор заявок в обоих (US-003). Источник истины — URL (SRS §7.3),
 *  разбор — в features/report-filters. */
export interface ReportFilters {
  status: ReportStatus[]
  category: string | null
  district: string | null
  from: string | null
  to: string | null
  dateField: DateField
}

export const EMPTY_FILTERS: ReportFilters = {
  status: [],
  category: null,
  district: null,
  from: null,
  to: null,
  dateField: 'created',
}

function searchParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams()
  // Пустой фильтр не отправляется вовсе: `?status=` и `?district=` дали бы каждому
  // посетителю свой ключ микрокэша nginx при одинаковом наборе заявок (SRS §4.7).
  if (filters.status.length > 0) params.set('status', filters.status.join(','))
  if (filters.category !== null) params.set('category', filters.category)
  if (filters.district !== null) params.set('district', filters.district)
  if (filters.from !== null) params.set('from', filters.from)
  if (filters.to !== null) params.set('to', filters.to)
  if (filters.dateField !== 'created') params.set('dateField', filters.dateField)
  return params
}

/** Карта. `bbox` — `minLon,minLat,maxLon,maxLat`, уже огрублённый до сетки
 *  (features/report-map/bbox.ts): точный прямоугольник экрана давал бы новый ключ
 *  на каждый жест и промах микрокэша на каждого посетителя. */
export function fetchReportMap(bbox: string, filters: ReportFilters): Promise<ReportMapResponse> {
  const params = searchParams(filters)
  params.set('bbox', bbox)
  return apiFetch<ReportMapResponse>(`/reports/map?${params.toString()}`)
}

export function fetchReportList(filters: ReportFilters, cursor: string | null): Promise<ReportListResponse> {
  const params = searchParams(filters)
  if (cursor !== null) params.set('cursor', cursor)
  return apiFetch<ReportListResponse>(`/reports?${params.toString()}`)
}

export function fetchReportDetail(number: number): Promise<ReportDetail> {
  return apiFetch<ReportDetail>(`/reports/${number}`)
}

export interface CreateReportPayload {
  latitude: number
  longitude: number
  categoryCode: string
  landmark: string
  contactPhone: string
  contactTelegram: string
  /** Honeypot. Пустое поле у человека и заполненное у робота (PRD §10.2). */
  website: string
  formOpenedAt: string
  locale: Locale
  photos: { blob: Blob; name: string }[]
}

/** Одна отправка = один `Idempotency-Key`. Ключ живёт вместе с черновиком, поэтому
 *  сколько бы раз житель ни нажал «повторить», заявка создастся одна (US-016). */
export function createReport(payload: CreateReportPayload, idempotencyKey: string): Promise<CreateReportResponse> {
  const form = new FormData()
  form.append('latitude', String(payload.latitude))
  form.append('longitude', String(payload.longitude))
  form.append('categoryCode', payload.categoryCode)
  form.append('landmark', payload.landmark)
  form.append('contactPhone', payload.contactPhone)
  form.append('contactTelegram', payload.contactTelegram)
  form.append('website', payload.website)
  form.append('formOpenedAt', payload.formOpenedAt)
  form.append('locale', payload.locale)
  for (const photo of payload.photos) form.append('photos', photo.blob, photo.name)

  return apiFetch<CreateReportResponse>('/reports', {
    method: 'POST',
    body: form,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** Знаменатель конверсии формы (метрика P-1). Ошибку глотаем намеренно: счётчик —
 *  это наша отчётность, а не то, ради чего житель пришёл, и падать из-за него нельзя. */
export function recordFormOpen(): void {
  void fetch('/api/form-opens', { method: 'POST' }).catch(() => undefined)
}
