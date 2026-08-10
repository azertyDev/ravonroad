/** Единый формат ответа об ошибке (SRS §8.1).
 *
 * `code` — стабильный машинный ключ, по которому клиент выбирает строку локали.
 * Список открыт кодами, которые нужны каркасу; каждый следующий срез добавляет свои.
 * Добавление кода без строки в словарях `uz`/`ru` ломает `pnpm typecheck`, а не прод:
 * словарь объявлен как `Record<ErrorCode, string>` (ADR-0006). */
export const ERROR_CODES = [
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'INTERNAL_ERROR',
  /** Точка не попала ни в один из 12 полигонов (SRS §3.3). Единственная жёсткая
   *  блокировка на входе — всё остальное в антиабузе только ставит флаг (PRD §10). */
  'OUTSIDE_TASHKENT',
  'PHOTOS_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'STORAGE_UNAVAILABLE',
  /** Курсор пагинации не разбирается. Молчаливый сброс на первую страницу маскировал бы
   *  баг пагинации, поэтому это ошибка, а не поведение по умолчанию (SRS §4.3). */
  'INVALID_CURSOR',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** Код приходит по сети и может оказаться из более новой версии сервера,
 *  чем собранный клиент, — поэтому проверяется, а не приводится типом. */
export function isErrorCode(value: string): value is ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(value)
}

/** Пара «поле → код» для подсветки конкретного поля формы (SRS §8.1).
 *  `code` — `string`: коды уровня поля описывают причину («слишком длинно», «не число»)
 *  и словарём локали не переводятся; форма показывает свой текст рядом с полем. */
export interface FieldError {
  field: string
  code: string
}

interface ApiErrorBase {
  /** Для разработчика, на английском. В UI не показывается никогда (SRS §8.1). */
  message: string
  correlationId: string
}

/** `details` допустим только при `VALIDATION_FAILED` — это и есть смысл разделения на ветви. */
export type ApiError =
  | (ApiErrorBase & { code: 'VALIDATION_FAILED'; details: FieldError[] })
  | (ApiErrorBase & { code: Exclude<ErrorCode, 'VALIDATION_FAILED'>; details?: never })

export interface ApiErrorBody {
  error: ApiError
}
