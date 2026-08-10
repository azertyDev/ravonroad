import type { ErrorCode } from '@ravonroad/shared-types'
import { useI18n } from '../../i18n/useI18n'

interface ErrorStateProps {
  /** Код из тела ответа. Текст берётся из словаря локали: message с сервера
   *  на английском и жителю не показывается никогда (SRS §8.1). */
  code?: ErrorCode
  onRetry?: () => void
}

export function ErrorState({ code, onRetry }: ErrorStateProps) {
  const { t, errorText } = useI18n()

  return (
    <div role="alert" className="flex flex-col items-start gap-[var(--s-3)]">
      <p className="t-body-l">{code === undefined ? t('state.errorTitle') : errorText(code)}</p>
      {onRetry !== undefined && (
        <button
          type="button"
          onClick={onRetry}
          className="t-label inline-flex min-h-[var(--touch-base)] items-center rounded-[var(--r-2)] bg-[var(--accent)] px-[var(--s-5)] text-[var(--text-on-accent)]"
        >
          {t('state.retry')}
        </button>
      )}
    </div>
  )
}
