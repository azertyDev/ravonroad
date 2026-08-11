import type { ErrorCode, ReportStatus, StatusReasonCode } from '@ravonroad/shared-types'
import type { Locale } from './locale'
import { ruError, ruUi } from './ru'
import { uzError, uzUi, type UiKey } from './uz'

/** Ключи доменных кодов выводятся из union-ов контракта, а не перечисляются заново.
 *  Новый статус или новая причина отказа в packages/shared-types ломают pnpm typecheck
 *  здесь — вместо того чтобы показать жителю пустое место на экране (SRS §8.2).
 *
 *  Категорий в этом списке нет и быть не может: их переводы живут в БД, а не в словаре
 *  локали (SRS §2.5). */
type DomainKey = `status.${ReportStatus}` | `reason.${StatusReasonCode}`

export interface Messages {
  ui: Record<UiKey, string> & Record<DomainKey, string>
  error: Record<ErrorCode, string>
}

export const MESSAGES: Record<Locale, Messages> = {
  uz: { ui: uzUi, error: uzError },
  ru: { ui: ruUi, error: ruError },
}

export type { UiKey }
