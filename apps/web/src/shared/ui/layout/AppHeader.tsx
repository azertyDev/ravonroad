import { Link } from '@tanstack/react-router'
import { LocaleSwitcher } from '../../i18n/LocaleSwitcher'
import { useI18n } from '../../i18n/useI18n'

export function AppHeader() {
  const { locale, t } = useI18n()

  return (
    <header className="border-b border-[var(--border-1)] bg-[var(--surface-card)]">
      <div className="mx-auto flex w-full max-w-[720px] flex-wrap items-center justify-between gap-[var(--s-2)] px-[var(--gutter)] py-[var(--s-3)]">
        <Link
          to="/$locale"
          params={{ locale }}
          className="t-label inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--r-2)]"
        >
          {t('app.name')}
        </Link>
        <LocaleSwitcher />
      </div>
    </header>
  )
}
