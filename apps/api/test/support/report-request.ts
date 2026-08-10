import { randomUUID } from 'node:crypto'
import type { TestApp } from './app'

/** Чиланзар: точка внутри города, на которой строятся почти все проверки приёма. */
export const INSIDE_TASHKENT = { latitude: '41.275512', longitude: '69.204411' }
/** Самарканд — заведомо вне всех 12 полигонов. */
export const OUTSIDE_TASHKENT = { latitude: '41.100000', longitude: '69.010000' }

export interface SubmitOptions {
  fields?: Record<string, string>
  photos?: Buffer[]
  photoType?: string
  idempotencyKey?: string | null
  headers?: Record<string, string>
}

/** Одна форма отправки на все тесты приёма: иначе каждый из них по-своему собирал бы
 *  multipart, и расхождение в сборке читалось бы как расхождение в поведении сервера. */
export async function submitReport(app: TestApp, options: SubmitOptions = {}): Promise<Response> {
  const form = new FormData()
  const fields = {
    ...INSIDE_TASHKENT,
    categoryCode: 'roadway_pothole',
    ...options.fields,
  }
  for (const [name, value] of Object.entries(fields)) form.append(name, value)

  for (const [index, photo] of (options.photos ?? []).entries()) {
    const type = options.photoType ?? 'image/jpeg'
    form.append('photos', new Blob([new Uint8Array(photo)], { type }), `photo-${index}.jpg`)
  }

  const key = options.idempotencyKey === undefined ? randomUUID() : options.idempotencyKey
  const headers: Record<string, string> = { ...options.headers }
  if (key !== null) headers['Idempotency-Key'] = key

  return fetch(`${app.baseUrl}/api/reports`, { method: 'POST', body: form, headers })
}
