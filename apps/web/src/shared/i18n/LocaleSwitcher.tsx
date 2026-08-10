import { Link } from '@tanstack/react-router'
import { LOCALES, type Locale } from './locale'
import type { UiKey } from './messages'
import { useI18n } from './useI18n'

const LABEL_KEY: Record<Locale, UiKey> = { uz: 'locale.uz', ru: 'locale.ru' }

/** Меняет только сегмент локали: путь и search-параметры сохраняются, иначе
 *  переключение языка сбрасывало бы выбранные фильтры (US-015).
 *
 *  Без `from` — намеренно: он задаёт базу, относительно которой считается `to`, и
 *  зафиксированный `/$locale` сводил бы «.» к корню локали, отбрасывая всё, что ниже. */
export function LocaleSwitcher() {
  const { locale, t } = useI18n()

  return (
    <nav aria-label={t('header.localeNavLabel')} className="flex items-center gap-1">
      {LOCALES.map((value) => (
        <Link
          key={value}
          to="."
          params={{ locale: value }}
          search={(previous) => previous}
          aria-current={value === locale ? 'true' : undefined}
          className="t-label inline-flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-[var(--r-2)] px-[var(--s-3)] aria-[current]:bg-[var(--accent)] aria-[current]:text-[var(--text-on-accent)]"
        >
          {t(LABEL_KEY[value])}
        </Link>
      ))}
    </nav>
  )
}
