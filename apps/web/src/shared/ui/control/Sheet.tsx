import { useEffect, useRef, type ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { Glyph } from '../icon/Glyph'
import { ICON_BUTTON } from './styles'

interface SheetProps {
  title: string
  /** Вторая строка заголовка: сколько заявок в срезе, какой район. */
  subtitle?: string
  onClose: () => void
  children: ReactNode
  /** Строка действий на дне листа — она не прокручивается вместе с содержимым. */
  footer?: ReactNode
}

/** Нижний лист на телефоне, модальное окно на ноутбуке.
 *
 *  Внутри — нативный `<dialog>`, и это единственная причина, по которой здесь нет ни
 *  ловушки фокуса, ни обработчика Escape, ни `aria-modal`, ни возврата фокуса на
 *  открывшую кнопку: `showModal()` делает всё это сам и делает правильно. Своя реализация
 *  тех же четырёх вещей — самый частый источник модалок, из которых не выбраться
 *  с клавиатуры.
 *
 *  Высота 92%, без промежуточной. Половинчатый лист на 390 px заставляет тянуться
 *  к верху экрана, а карта под ним всё равно не читается (Mobile States C).
 *
 *  Закрытие приходит одним путём — событием `close` элемента: и крестик, и Escape,
 *  и клик по подложке сводятся к нему, поэтому наружу уходит ровно один `onClose`. */
export function Sheet({ title, subtitle, onClose, children, footer }: SheetProps) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    // Закрыть страницу можно и в обход кнопки — размонтированием при переходе назад.
    return () => element?.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      // Клик мимо содержимого: у `<dialog>` подложка — часть самого элемента, поэтому
      // попадание ровно в него и означает «мимо».
      onClick={(event) => {
        if (event.target === dialog.current) dialog.current?.close()
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 grid h-[var(--sheet-full)] max-h-none w-full max-w-none grid-rows-[auto_1fr_auto] overflow-hidden rounded-t-[16px] border-t border-[var(--border-1)] bg-[var(--surface-page)] p-0 text-[var(--text-1)] backdrop:bg-[rgba(18,22,28,.6)] md:inset-0 md:m-auto md:h-auto md:max-h-[85dvh] md:w-[min(900px,92vw)] md:rounded-[var(--r-4)] md:border"
    >
      <div className="flex flex-col gap-[var(--s-3)] px-[var(--gutter)] pt-[var(--s-4)] pb-[var(--s-4)]">
        {/* Хват листа. Декоративный: тянуть его мы не умеем, но без него край листа
            читается как обрезанная страница, а не как поднятая панель. */}
        <span aria-hidden="true" className="mx-auto h-[4px] w-[40px] rounded-[var(--r-1)] bg-[var(--asphalt-500)] md:hidden" />
        <div className="flex items-start justify-between gap-[var(--s-3)]">
          <div className="flex min-w-0 flex-col gap-[var(--s-1)]">
            <h2 className="t-h2 uppercase">{title}</h2>
            {subtitle !== undefined && <p className="t-section text-[var(--text-2)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={t('map.close')} className={ICON_BUTTON}>
            <Glyph name="close" />
          </button>
        </div>
      </div>

      <div className="min-h-0 overflow-auto px-[var(--gutter)] pb-[var(--s-4)]">{children}</div>

      {footer !== undefined && (
        <div className="flex flex-col gap-[var(--s-2)] border-t border-[var(--border-1)] px-[var(--gutter)] pt-[var(--s-4)] pb-[calc(var(--screen-bottom)+var(--safe-bottom))]">
          {footer}
        </div>
      )}
    </dialog>
  )
}
