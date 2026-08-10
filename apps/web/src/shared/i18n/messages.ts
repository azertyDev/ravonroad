import type { ErrorCode } from '@ravonroad/shared-types'
import type { Locale } from './locale'
import { ruError, ruUi } from './ru'
import { uzError, uzUi, type UiKey } from './uz'

export interface Messages {
  ui: Record<UiKey, string>
  error: Record<ErrorCode, string>
}

export const MESSAGES: Record<Locale, Messages> = {
  uz: { ui: uzUi, error: uzError },
  ru: { ui: ruUi, error: ruError },
}

export type { UiKey }
