import { HttpException } from '@nestjs/common'
import type { ErrorCode, FieldError } from '@ravonroad/shared-types'

/** Ошибка в формате SRS §8.1. Код — стабильный машинный ключ, по которому клиент
 *  выбирает строку локали; `message` предназначен разработчику и в UI не показывается
 *  никогда, иначе житель увидел бы английский текст. */
export class ApiException extends HttpException {
  readonly code: ErrorCode
  readonly details: FieldError[]

  constructor(code: ErrorCode, status: number, message: string, details: FieldError[] = []) {
    super(message, status)
    this.code = code
    this.details = details
  }
}
