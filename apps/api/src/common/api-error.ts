import { HttpException } from '@nestjs/common'
import type { ErrorCode, FieldError } from '@ravonroad/shared-types'

/** Ошибка в формате SRS §8.1. Код — стабильный машинный ключ, по которому клиент
 *  выбирает строку локали; `message` предназначен разработчику и в UI не показывается
 *  никогда, иначе житель увидел бы английский текст. */
export class ApiException extends HttpException {
  readonly code: ErrorCode
  readonly details: FieldError[]
  /** Заголовки, без которых отказ бесполезен: `429` без `Retry-After` заставляет клиента
   *  гадать, а гадает он тесным циклом. Проставляет их фильтр — там же, где тело. */
  readonly headers: Record<string, string>

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    options: { details?: FieldError[]; headers?: Record<string, string> } = {},
  ) {
    super(message, status)
    this.code = code
    this.details = options.details ?? []
    this.headers = options.headers ?? {}
  }
}
