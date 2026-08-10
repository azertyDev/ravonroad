import { isErrorCode, type ApiErrorBody, type ErrorCode, type FieldError } from '@ravonroad/shared-types'

/** Сайт и API отвечают на одном origin: наружу их сводит edge, в разработке —
 *  прокси Vite. Базовый адрес поэтому относительный и не настраивается. */
const API_BASE = '/api'

export class ApiRequestError extends Error {
  readonly code: ErrorCode
  readonly correlationId: string
  readonly details: readonly FieldError[]

  constructor(code: ErrorCode, correlationId: string, details: readonly FieldError[] = []) {
    super(`${code} (${correlationId})`)
    this.name = 'ApiRequestError'
    this.code = code
    this.correlationId = correlationId
    this.details = details
  }
}

function asApiErrorBody(body: unknown): ApiErrorBody | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const { error } = body as { error?: unknown }
  if (typeof error !== 'object' || error === null) return undefined
  const { code, correlationId } = error as { code?: unknown; correlationId?: unknown }
  if (typeof code !== 'string' || !isErrorCode(code)) return undefined
  if (typeof correlationId !== 'string') return undefined
  return body as ApiErrorBody
}

/** Тело ошибки разбирается, а не принимается на веру: наружу смотрят и nginx с его
 *  502-страницей, и стандартный 404 Nest, и сервер новее клиента с ещё неизвестным
 *  кодом. Во всех трёх случаях житель должен увидеть текст, а не пустой экран. */
export function parseApiError(status: number, body: unknown, correlationId: string): ApiRequestError {
  const parsed = asApiErrorBody(body)
  if (parsed === undefined) {
    return new ApiRequestError(status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', correlationId)
  }
  const { error } = parsed
  // Тип обещает массив, сеть — нет: форма разбирает details через map, и объект вместо
  // массива уронил бы её TypeError'ом вместо того, чтобы показать текст ошибки.
  const details = error.code === 'VALIDATION_FAILED' && Array.isArray(error.details) ? error.details : []
  return new ApiRequestError(error.code, error.correlationId, details)
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  // Идентификатор из заголовка — запасной: если тело не разобралось, назвать запрос
  // в обращении всё равно можно (SRS §8.3).
  const correlationId = response.headers.get('X-Request-Id') ?? ''
  const body: unknown = await response.json().catch(() => undefined)

  if (!response.ok) throw parseApiError(response.status, body, correlationId)

  // Успешный ответ описан контрактом shared-types и рантайм-схемой не проверяется:
  // потребитель API ровно один и собирается из тех же типов (ADR-0006).
  return body as T
}
