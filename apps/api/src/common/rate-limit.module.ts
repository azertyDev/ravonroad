import { Module } from '@nestjs/common'
import { RateLimiter } from './rate-limit'

/** Один счётчик на процесс. Если бы каждый модуль создавал свой, окна не складывались бы,
 *  и адрес, исчерпавший лимит на одном маршруте, начинал бы с нуля на другом. Ключи
 *  при этом обязаны быть разведены по маршрутам — см. `RATE_LIMITS`. */
@Module({
  providers: [RateLimiter],
  exports: [RateLimiter],
})
export class RateLimitModule {}
