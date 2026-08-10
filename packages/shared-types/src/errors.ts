/** Единый формат ответа об ошибке (SRS §8.1).
 *
 * `code` — стабильный машинный ключ, по которому клиент выбирает строку локали.
 * Список открыт кодами, которые нужны каркасу; каждый следующий срез добавляет свои.
 * Добавление кода без строки в словарях `uz`/`ru` ломает `pnpm typecheck`, а не прод:
 * словарь объявлен как `Record<ErrorCode, string>` (ADR-0006). */
export const ERROR_CODES = ['VALIDATION_FAILED', 'NOT_FOUND', 'INTERNAL_ERROR'] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** Пара «поле → код» для подсветки конкретного поля формы (SRS §8.1).
 *  `code` пока `string`: словарь кодов уровня поля появляется вместе с формой в срезе 002. */
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
