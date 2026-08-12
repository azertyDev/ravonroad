import { useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { ICON_BUTTON } from '../control/styles'
import { Glyph } from '../icon/Glyph'

interface PageHeadProps {
  /** Середина строки: номер заявки. Табличными цифрами — он копируемый и его сверяют. */
  title: string
  /** Правый край: «поделиться», переключатель темы, что угодно на 44 px. */
  action?: ReactNode
}

/** Строка страницы заявки: назад, номер, действие.
 *
 *  Кнопка «назад» вызывает историю браузера, а не ведёт на фиксированный маршрут:
 *  на эту страницу приходят и с карты, и из списка, и по ссылке из мессенджера,
 *  и возврат на карту из последнего случая увёл бы человека туда, где он не был.
 *
 *  Когда возвращаться некуда — по ссылке из мессенджера это ровно так, — кнопки нет:
 *  «назад», которое ничего не делает, хуже её отсутствия. */
export function PageHead({ title, action }: PageHeadProps) {
  const { t } = useI18n()
  const router = useRouter()
  const canGoBack = router.history.canGoBack()

  return (
    <div className="flex items-center justify-between gap-[var(--s-2)] px-[var(--gutter)] pb-[var(--s-3)]">
      {canGoBack ? (
        <button type="button" onClick={() => router.history.back()} aria-label={t('report.back')} className={ICON_BUTTON}>
          <Glyph name="back" />
        </button>
      ) : (
        // Заглушка держит номер по центру между двумя кнопками — так строка устроена
        // на телефоне. На ноутбуке центрировать нечего: кнопки «назад» там обычно нет,
        // и номер повисал в пустоте между левым краем и действиями.
        <span className="w-[var(--touch-min)] lg:hidden" />
      )}
      {/* Не заголовок: имя страницы даёт ориентир в теле заявки (ReportSummary),
          и второй h1 с номером спорил бы с ним за роль. */}
      <span className="t-h3 font-extrabold tabular-nums lg:mr-auto">{title}</span>
      {action ?? <span className="w-[var(--touch-min)]" />}
    </div>
  )
}
