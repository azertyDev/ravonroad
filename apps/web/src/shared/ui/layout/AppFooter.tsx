import { useI18n } from '../../i18n/useI18n'

const CONTACT_URL = import.meta.env.VITE_CAMPAIGN_CONTACT_URL

/** Подвал: одна строка про то, кто ведёт проект, и связь с кампанией.
 *
 *  Государство в тексте не упоминается — его в процессе и нет (readme › Content
 *  fundamentals). Строка стоит после нижней панели действия и прокручивается под неё:
 *  главное действие экрана она не перебивает. */
export function AppFooter() {
  const { t } = useI18n()

  return (
    <footer className="mx-auto w-full max-w-[720px] px-[var(--gutter)] pt-[var(--s-5)] pb-[calc(var(--screen-bottom)+var(--safe-bottom))] lg:max-w-[1120px]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--s-3)]">
        <p className="t-caption text-[var(--text-2)]">{t('footer.volunteers')}</p>
        {CONTACT_URL !== undefined && CONTACT_URL !== '' && (
          <a
            href={CONTACT_URL}
            className="t-chip inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--r-2)] text-[var(--text-2)] underline decoration-[var(--accent)] decoration-2 underline-offset-4"
          >
            {t('footer.contact')}
          </a>
        )}
      </div>
    </footer>
  )
}
