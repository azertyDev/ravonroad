import type { ErrorCode } from '@ravonroad/shared-types'
import { useI18n } from '../../i18n/useI18n'
import { COMPACT_ACCENT } from '../control/styles'

interface ErrorStateProps {
  /** Код из тела ответа. Текст берётся из словаря локали: message с сервера
   *  на английском и жителю не показывается никогда (SRS §8.1). */
  code?: ErrorCode
  onRetry?: () => void
}

/** Компактный отказ: поверх карты, внутри списка, в карточке маркера.
 *  Во весь экран отказ показывает `ErrorScreen` — это другое сообщение, а не другой
 *  размер этого. */
export function ErrorState({ code, onRetry }: ErrorStateProps) {
  const { t, errorText } = useI18n()

  return (
    <div role="alert" className="flex flex-col items-start gap-[var(--s-3)]">
      <p className="t-body">{code === undefined ? t('state.errorTitle') : errorText(code)}</p>
      {onRetry !== undefined && (
        <button type="button" onClick={onRetry} className={COMPACT_ACCENT}>
          {t('state.retry')}
        </button>
      )}
    </div>
  )
}
