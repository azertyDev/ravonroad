import { useParams } from '@tanstack/react-router'
import type { ErrorCode } from '@ravonroad/shared-types'
import { DEFAULT_LOCALE, isLocale, type Locale } from './locale'
import { MESSAGES, type UiKey } from './messages'

interface I18n {
  locale: Locale
  t: (key: UiKey) => string
  errorText: (code: ErrorCode) => string
}

export function useI18n(): I18n {
  const { locale } = useParams({ from: '/$locale' })
  // Маршрут уже отсеял чужие значения редиректом; проверка нужна типу, а не рантайму.
  const current = isLocale(locale) ? locale : DEFAULT_LOCALE
  const messages = MESSAGES[current]
  return {
    locale: current,
    t: (key) => messages.ui[key],
    errorText: (code) => messages.error[code],
  }
}
