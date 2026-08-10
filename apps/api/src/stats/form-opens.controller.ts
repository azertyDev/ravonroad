import { Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import type { IncomingMessage } from 'node:http'
import { ApiException } from '../common/api-error'
import { clientIp } from '../common/client-ip'
import { RATE_LIMITS, rateLimitKey, RateLimiter } from '../common/rate-limit'
import { FormOpensService } from './form-opens.service'

@Controller('form-opens')
export class FormOpensController {
  constructor(
    private readonly formOpens: FormOpensService,
    private readonly limiter: RateLimiter,
  ) {}

  /** Тело пустое и ответ пустой: счётчику нечего принимать и нечего возвращать.
   *  Лимит здесь не про абьюз, а про то, что портить счётчик ничего не стоит,
   *  но и заливать его незачем (SRS §9.5). */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async record(@Req() request: IncomingMessage): Promise<void> {
    const address = clientIp(request)
    if (address !== null) {
      const verdict = this.limiter.hit(rateLimitKey('form-opens', address), RATE_LIMITS.formOpens)
      if (!verdict.allowed) {
        throw new ApiException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, 'too many form opens', {
          headers: { 'Retry-After': String(verdict.retryAfterS) },
        })
      }
    }

    await this.formOpens.increment()
  }
}
