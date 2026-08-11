import { useParams } from '@tanstack/react-router'
import type { ErrorCode } from '@ravonroad/shared-types'
import { DEFAULT_LOCALE, isLocale, type Locale } from './locale'
import { MESSAGES, type UiKey } from './messages'
import { pluralForm } from './plural'

/** Подписи, которые стоят вплотную к числу и обязаны с ним согласовываться.
 *  Каждая объявлена в словаре четырьмя формами: `<key>.one|few|many|other`. */
type PluralKey = 'home.districts'

interface I18n {
  locale: Locale
  t: (key: UiKey) => string
  /** Подпись под число: «1 район», «2 района», «11 районов». */
  tp: (key: PluralKey, count: number) => string
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
    // Приведение одно и здесь: PluralKey объявляет базу, а формы к ней дописывает
    // словарь, и проверить это соединение типом можно только перечислив все четыре
    // ключа руками — ровно то, ради чего PluralKey и заведён.
    tp: (key, count) => messages.ui[`${key}.${pluralForm(current, count)}` as UiKey],
    errorText: (code) => messages.error[code],
  }
}
