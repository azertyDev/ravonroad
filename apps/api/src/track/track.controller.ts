import { Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Req } from '@nestjs/common'
import type { TrackView } from '@ravonroad/shared-types'
import type { IncomingMessage } from 'node:http'
import { ApiException } from '../common/api-error'
import { clientIp } from '../common/client-ip'
import { RATE_LIMITS, rateLimitKey, RateLimiter } from '../common/rate-limit'
import { TrackService } from './track.service'

/** `no-store` на обоих маршрутах: токен лежит в пути URL и не должен оседать
 *  в промежуточных кэшах (SRS §9.2). Утечку через `Referer` закрывает
 *  `Referrer-Policy: no-referrer` на весь сайт. */
const NO_STORE = 'no-store'

@Controller('track')
export class TrackController {
  constructor(
    private readonly track: TrackService,
    private readonly limiter: RateLimiter,
  ) {}

  @Get(':token')
  @Header('Cache-Control', NO_STORE)
  view(@Param('token') token: string, @Req() request: IncomingMessage): Promise<TrackView> {
    this.guard(request)
    return this.track.view(token)
  }

  @Delete(':token/contacts')
  @Header('Cache-Control', NO_STORE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteContacts(@Param('token') token: string, @Req() request: IncomingMessage): Promise<void> {
    this.guard(request)
    await this.track.deleteContacts(token)
  }

  /** 30 запросов в минуту с адреса — единственная защита от перебора токенов;
   *  законный владелец ссылки не делает и десяти (SRS §9.5). Постоянное время сравнения
   *  не требуется: 128 бит энтропии делают тайминг-атаку бессмысленной раньше,
   *  чем она станет измеримой. */
  private guard(request: IncomingMessage): void {
    const address = clientIp(request)
    if (address === null) return
    const verdict = this.limiter.hit(rateLimitKey('track', address), RATE_LIMITS.track)
    if (!verdict.allowed) {
      throw new ApiException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, 'too many tracking requests', {
        headers: { 'Retry-After': String(verdict.retryAfterS) },
      })
    }
  }
}
