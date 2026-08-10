import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common'
import type { ApiErrorBody, ErrorCode } from '@ravonroad/shared-types'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ApiException } from './api-error'

/** Единый формат ответа об ошибке для всего API (SRS §8.1).
 *
 *  Фильтр стоит глобально, потому что жителю всё равно, кто бросил исключение — наш код,
 *  валидация Nest или стандартный 404 маршрутизатора: разбирать он будет одно и то же
 *  тело. Клиент, встретив незнакомую форму, показал бы общий текст об ошибке и потерял бы
 *  и код, и correlationId. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    // Типы из node:http, а не из express: @types/express в проекте нет, а нужны
    // ровно заголовок запроса и запись ответа — то, что есть у обоих.
    const request = http.getRequest<IncomingMessage>()
    const response = http.getResponse<ServerResponse>()

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR
    const code = resolveCode(exception, status)
    const details = exception instanceof ApiException ? exception.details : []

    // Идентификатор ставит middleware на каждый запрос: житель может назвать его
    // в обращении, разработчик — найти запрос в логе одной командой (SRS §8.3).
    const correlationId = String(request.headers['x-request-id'] ?? '')

    const body: ApiErrorBody = {
      error:
        code === 'VALIDATION_FAILED'
          ? { code, message: messageOf(exception), correlationId, details }
          : { code, message: messageOf(exception), correlationId },
    }
    if (exception instanceof ApiException) {
      for (const [name, value] of Object.entries(exception.headers)) response.setHeader(name, value)
    }

    response.statusCode = status
    response.setHeader('Content-Type', 'application/json; charset=utf-8')
    response.end(JSON.stringify(body))
  }
}

function resolveCode(exception: unknown, status: number): ErrorCode {
  if (exception instanceof ApiException) return exception.code
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND'
  if (status === HttpStatus.PAYLOAD_TOO_LARGE) return 'PAYLOAD_TOO_LARGE'
  if (status === HttpStatus.UNSUPPORTED_MEDIA_TYPE) return 'UNSUPPORTED_MEDIA_TYPE'
  if (status === HttpStatus.TOO_MANY_REQUESTS) return 'RATE_LIMITED'
  if (status === HttpStatus.BAD_REQUEST) return 'VALIDATION_FAILED'
  return 'INTERNAL_ERROR'
}

/** Текст только для разработчика — на английском и без содержимого запроса:
 *  в тело ошибки не должны просачиваться ни координаты, ни контакты (SRS §8.4). */
function messageOf(exception: unknown): string {
  if (exception instanceof HttpException) return exception.message
  return 'unexpected error'
}
