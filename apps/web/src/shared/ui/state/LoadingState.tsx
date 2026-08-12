import { useI18n } from '../../i18n/useI18n'

/** aria-live, а не просто текст: смена состояния должна быть слышна, иначе
 *  пользователь скринридера не узнает, что страница чем-то занята.
 *
 *  Спиннер — единственная бесконечная анимация в системе, и он рисуется только здесь.
 *  Подпись рядом обязательна: крутящееся кольцо само по себе не говорит, что грузится
 *  и сколько это продлится. */
export function LoadingState() {
  const { t } = useI18n()

  return (
    <p
      role="status"
      aria-live="polite"
      className="t-caption inline-flex items-center gap-[var(--s-2)] text-[var(--text-2)]"
    >
      <span
        aria-hidden="true"
        className="h-[16px] w-[16px] animate-[rr-spin_.8s_linear_infinite] rounded-[var(--r-pill)] border-2 border-[var(--border-2)] border-t-[var(--accent)]"
      />
      {t('state.loading')}
    </p>
  )
}
