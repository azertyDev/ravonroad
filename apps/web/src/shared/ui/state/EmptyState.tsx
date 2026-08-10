import { useI18n } from '../../i18n/useI18n'

export function EmptyState() {
  const { t } = useI18n()

  return <p className="t-caption text-[var(--text-2)]">{t('state.empty')}</p>
}
