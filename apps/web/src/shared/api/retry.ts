import type { ErrorCode } from '@ravonroad/shared-types'
import { ApiRequestError } from './client'

/** Ответы, которые повтором не исправить: сервер уже сказал, что не так, и скажет
 *  то же самое. Заявки с таким номером нет и не появится, курсор не станет разбираться,
 *  точка не переедет в Ташкент.
 *
 *  Всё остальное — обрыв связи, `INTERNAL_ERROR`, `STORAGE_UNAVAILABLE`, `RATE_LIMITED` —
 *  повторить стоит: у бордюра сеть пропадает на секунды. */
const FINAL: readonly ErrorCode[] = [
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'OUTSIDE_TASHKENT',
  'PHOTOS_REQUIRED',
  'IDEMPOTENCY_CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'INVALID_CURSOR',
]

/** Сколько раз повторяем то, что повторить имеет смысл. Больше двух на платном
 *  мобильном трафике — это чужие деньги за один и тот же ответ. */
const MAX_ATTEMPTS = 2

/** Политика повторов для всего клиента.
 *
 *  Без неё страница несуществующей заявки показывала «Загрузка…» секунд семь: три
 *  повтора с растущей паузой за `404`, который пришёл за шестьдесят миллисекунд.
 *  Человек всё это время смотрел на спиннер вместо ответа «такой заявки нет». */
export function retryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiRequestError && FINAL.includes(error.code)) return false
  return failureCount < MAX_ATTEMPTS
}
