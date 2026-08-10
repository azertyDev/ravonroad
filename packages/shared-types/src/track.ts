import type { ReportDetail } from './report'

/** Страница отслеживания (SRS §4.5). Всё из публичной карточки плюс то, что видит только
 *  владелец ссылки: причина отказа, ссылка на оригинал дубля и **признак** наличия
 *  контактов — не сами контакты. Токен даёт кнопку удаления, а не значения (US-014). */
export interface TrackView extends ReportDetail {
  /** Код причины `REJECTED`/`OUT_OF_SCOPE`; переводит клиент (SRS §8.2). */
  statusReason: string | null
  /** Свободный текст модератора при причине «другое». Не переводится и показывается
   *  как введён — о чём на странице сказано рядом. */
  statusReasonText: string | null
  /** Публичный номер оригинала при `DUPLICATE`. */
  duplicateOfNumber: number | null
  hasContacts: boolean
}
