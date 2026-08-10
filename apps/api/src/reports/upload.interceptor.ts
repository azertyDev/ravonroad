import { HttpStatus, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MAX_UPLOAD_BYTES } from '@ravonroad/shared-types'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { finalize, type Observable } from 'rxjs'
import { ApiException } from '../common/api-error'
import { Semaphore, SemaphoreTimeoutError } from '../common/semaphore'

/** Девятый запрос ждёт в очереди до 20 секунд, дальше получает `429` с `Retry-After`.
 *  Двадцать секунд — не круглое число ради круглости: столько житель у ямы ещё готов
 *  ждать отправку, а форма повторит с тем же `Idempotency-Key`, и дубля не будет. */
const ACQUIRE_TIMEOUT_MS = 20_000
const ACQUIRE_TIMEOUT_S = ACQUIRE_TIMEOUT_MS / 1000

/** Восемь на проде: 8 × 8 МБ = 64 МБ буферов в худшем случае (SRS §4.2).
 *  На dev с его 1 ГБ оверлей compose ставит два (SRS §12.2). */
const DEFAULT_CONCURRENCY = 8

/** Первое, что происходит с запросом на подачу заявки, — и первое по порядку в SRS §5.3:
 *  лимиты **до буферизации**. Заявленный размер отклоняется до того, как из сети прочитан
 *  первый байт тела, а пропуск семафора берётся до того, как multer начнёт складывать
 *  файлы в память. Обе проверки бессмысленны, если выполнить их после. */
@Injectable()
export class UploadInterceptor implements NestInterceptor {
  private readonly semaphore: Semaphore

  constructor(config: ConfigService) {
    this.semaphore = new Semaphore(config.get<number>('INTAKE_CONCURRENCY') ?? DEFAULT_CONCURRENCY)
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp()
    const request = http.getRequest<IncomingMessage>()

    const declaredBytes = Number(request.headers['content-length'] ?? 0)
    if (declaredBytes > MAX_UPLOAD_BYTES) {
      throw new ApiException(
        'PAYLOAD_TOO_LARGE',
        HttpStatus.PAYLOAD_TOO_LARGE,
        `request body is ${declaredBytes} bytes, limit is ${MAX_UPLOAD_BYTES}`,
      )
    }

    try {
      await this.semaphore.acquire(ACQUIRE_TIMEOUT_MS)
    } catch (error) {
      if (!(error instanceof SemaphoreTimeoutError)) throw error
      // Единственный жёсткий отказ на пути подачи, и он про исчерпание памяти,
      // а не про подозрительность отправителя (SRS §5.7).
      http.getResponse<ServerResponse>().setHeader('Retry-After', String(ACQUIRE_TIMEOUT_S))
      throw new ApiException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, 'intake is at capacity')
    }

    // finalize, а не then: пропуск обязан вернуться и при ошибке в обработчике,
    // иначе после первого же сбоя приём медленно встаёт совсем.
    return next.handle().pipe(finalize(() => this.semaphore.release()))
  }
}
