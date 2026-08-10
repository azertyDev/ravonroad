import type { CreateReportResponse, Locale } from '@ravonroad/shared-types'
import { apiFetch } from '../../shared/api/client'

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
