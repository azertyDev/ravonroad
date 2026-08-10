import { HttpStatus, Injectable } from '@nestjs/common'
import { MAX_PHOTOS_PER_REPORT } from '@ravonroad/shared-types'
import { ApiException } from '../common/api-error'
import { RATE_LIMITS, RateLimiter } from '../common/rate-limit'

/** Меньше пяти секунд при трёх приложенных фотографиях человеку недостижимо: их надо
 *  выбрать, дождаться сжатия и посмотреть на предпросмотр (PRD §10.3). При одной
 *  фотографии пять секунд — обычное дело, поэтому правило смотрит и на число файлов. */
const FAST_FILL_MS = 5000

export type AbuseRuleName = 'HONEYPOT' | 'FAST_FILL' | 'IP_RATE'

export interface AbuseSignalDraft {
  rule: AbuseRuleName
  detail: Record<string, number> | null
}

export interface AbuseInput {
  honeypotFilled: boolean
  formOpenedAt: Date | null
  photoCount: number
  /** Сколько заявок пришло с этого адреса за час, включая текущую. */
  reportsThisHour: number
}

/** Антиабуз этого среза (PRD §10).
 *
 *  **Единственная жёсткая блокировка на входе — геозабор.** Всё, что здесь, ставит флаг
 *  и передаёт решение модератору: цена ложного отказа — потерянная настоящая яма, а цена
 *  ложного флага — один тап в Telegram. Капчи нет; условия её появления зафиксированы
 *  в PRD §10.5 и здесь не дублируются.
 *
 *  Исключение одно — 60 заявок в час с адреса. Это барьер против исчерпания ресурса,
 *  а не суждение о добросовестности: за CGNAT один адрес — это сотни людей (SRS §9.5). */
@Injectable()
export class AbuseService {
  constructor(private readonly limiter: RateLimiter) {}

  /** Регистрирует попытку подачи и возвращает число заявок с адреса за час.
   *  Превышение жёсткого порога отвечает `429` с `Retry-After`. */
  admit(clientIp: string | null): number {
    // Адреса нет — за прокси такого не бывает, но и отказывать не за что: считать
    // некого, значит правило неприменимо.
    if (clientIp === null) return 1

    const verdict = this.limiter.hit(clientIp, RATE_LIMITS.reportsHard)
    if (!verdict.allowed) {
      throw new ApiException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, 'too many reports from this address', {
        headers: { 'Retry-After': String(verdict.retryAfterS) },
      })
    }
    return verdict.count
  }

  /** Сигналы, которые надо записать вместе с заявкой. Пустой список — обычное дело.
   *  Ни один из них не отклоняет заявку: они показываются модератору в карточке (US-025). */
  signalsFor(input: AbuseInput): AbuseSignalDraft[] {
    const signals: AbuseSignalDraft[] = []

    // Поле невидимо человеку и не объявлено скринридерам, но заполняется менеджерами
    // паролей и автозаполнением, поэтому оно флаг, а не отказ (PRD §10.2).
    if (input.honeypotFilled) signals.push({ rule: 'HONEYPOT', detail: null })

    if (input.formOpenedAt !== null && input.photoCount >= MAX_PHOTOS_PER_REPORT) {
      const fillMs = Date.now() - input.formOpenedAt.getTime()
      // Отрицательное значение означает часы устройства, а не подделку: такие
      // отметки просто не считаются.
      if (fillMs >= 0 && fillMs < FAST_FILL_MS) signals.push({ rule: 'FAST_FILL', detail: { fillMs } })
    }

    if (input.reportsThisHour > RATE_LIMITS.reportsSoft.limit) {
      signals.push({ rule: 'IP_RATE', detail: { perHour: input.reportsThisHour } })
    }

    return signals
  }
}
