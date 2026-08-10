import { useI18n } from '../../i18n/useI18n'

const CONTACT_URL = import.meta.env.VITE_CAMPAIGN_CONTACT_URL

export function AppFooter() {
  const { t } = useI18n()

  return (
    <footer className="border-t border-[var(--border-1)] bg-[var(--surface-card)]">
      <div className="mx-auto w-full max-w-[720px] px-[var(--gutter)] py-[var(--s-5)]">
        {CONTACT_URL !== undefined && CONTACT_URL !== '' ? (
          <a
            href={CONTACT_URL}
            className="t-caption inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--r-2)] text-[var(--text-2)] underline"
          >
            {t('footer.contact')}
          </a>
        ) : (
          <p className="t-caption text-[var(--text-2)]">{t('footer.contact')}</p>
        )}
      </div>
    </footer>
  )
}
