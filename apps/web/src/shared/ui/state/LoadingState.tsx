import { useI18n } from '../../i18n/useI18n'

/** aria-live, а не просто текст: смена состояния должна быть слышна, иначе
 *  пользователь скринридера не узнает, что страница чем-то занята. */
export function LoadingState() {
  const { t } = useI18n()

  return (
    <p role="status" aria-live="polite" className="t-caption text-[var(--text-2)]">
      {t('state.loading')}
    </p>
  )
}
