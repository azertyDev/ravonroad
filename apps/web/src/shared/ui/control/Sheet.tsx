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
  /** Во весь экран на телефоне вместо листа на 92%. Форма заявки — не выбор из
   *  короткого набора, а работа на пять шагов: полоска карты над ней ничего не даёт,
   *  а высоту отнимает (Form C — это экран целиком, а не лист). */
  fill?: boolean
}

/** Нижний лист на телефоне, модальное окно на ноутбуке.
 *
 *  Внутри — нативный `<dialog>` с `showModal()`, и это единственная причина, по которой
 *  здесь нет ни ловушки фокуса, ни `aria-modal`, ни возврата фокуса на открывшую кнопку,
 *  ни блокировки фона: браузер делает всё это сам и делает правильно. Своя реализация
 *  тех же четырёх вещей — самый частый источник модалок, из которых не выбраться
 *  с клавиатуры.
 *
 *  Закрытие при этом идёт мимо события `close`, и это не лень, а необходимость. Лист
 *  живёт ровно столько, сколько родитель держит его смонтированным, поэтому источником
 *  истины обязано быть родительское состояние. Если положиться на `close`, элемент
 *  остаётся в разметке уже закрытым, состояние наверху всё ещё считает его открытым,
 *  и повторное нажатие кнопки не меняет ничего — лист закрывается ровно один раз
 *  за жизнь страницы. Поэтому все три пути — крестик, Escape, клик мимо — зовут
 *  `onClose`, а размонтирование убирает элемент из верхнего слоя само.
 *
 *  Высота 92%, без промежуточной. Половинчатый лист на 390 px заставляет тянуться
 *  к верху экрана, а карта под ним всё равно не читается (Mobile States C). */
/** Клик мимо содержимого — это нажатие И отпускание на подложке, а не одно отпускание.
 *
 *  Событие `click` приходит на ближайшего общего предка нажатия и отпускания, а для
 *  `<dialog>` подложка — часть самого элемента. Поэтому жест, начатый внутри окна
 *  и законченный за его краем, приходил на диалог и читался как «клик мимо»: карту
 *  тянули пальцем, курсор уезжал за модалку — и форма закрывалась вместе с набранным.
 *  Нажатие внутри окна лишает жест права закрывать, чем бы он ни кончился. */
export function dismissedByBackdrop(pressedBackdrop: boolean, clickTarget: EventTarget | null, dialog: Element | null): boolean {
  return pressedBackdrop && clickTarget === dialog
}

export function Sheet({ title, subtitle, onClose, children, footer, fill = false }: SheetProps) {
  const { t } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const pressedBackdrop = useRef(false)
  // Обработчик читается из ref: слушатель вешается один раз на открытие, а замкнутый
  // в нём первый onClose держал бы устаревшее состояние.
  const closing = useRef(onClose)
  closing.current = onClose

  useEffect(() => {
    const element = dialog.current
    if (element === null) return
    // Повторный showModal на уже открытом диалоге бросает InvalidStateError, а в
    // StrictMode эффект выполняется дважды подряд.
    if (!element.open) element.showModal()

    // Escape. `cancel` отменяем: иначе браузер закроет элемент сам, и разметка
    // разойдётся с состоянием родителя ровно так, как описано выше.
    const cancel = (event: Event): void => {
      event.preventDefault()
      closing.current()
    }
    element.addEventListener('cancel', cancel)
    return () => element.removeEventListener('cancel', cancel)
  }, [])

  return (
    // Клавиатурной пары у клика по подложке нет и не нужно: с клавиатуры лист
    // закрывает Escape, обработанный выше.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialog}
      // Нажатие запоминается: закрывает только жест, целиком прошедший по подложке
      // (см. `dismissedByBackdrop`).
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === dialog.current
      }}
      onClick={(event) => {
        if (dismissedByBackdrop(pressedBackdrop.current, event.target, dialog.current)) onClose()
        pressedBackdrop.current = false
      }}
      className={`fixed inset-x-0 bottom-0 top-auto m-0 grid max-h-none w-full max-w-none grid-rows-[auto_1fr_auto] overflow-hidden border-t border-[var(--border-1)] bg-[var(--surface-page)] p-0 text-[var(--text-1)] backdrop:bg-[rgba(18,22,28,.72)] md:inset-0 md:m-auto md:h-auto md:max-h-[85dvh] md:w-[min(900px,92vw)] md:rounded-[var(--r-4)] md:border ${
        fill ? 'inset-0 h-full' : 'h-[var(--sheet-full)] rounded-t-[16px]'
      }`}
    >
      {/* Та же лента, что по кромке страницы: окно — продолжение той же дорожной
          разметки, а не всплывшая поверх неё панель (Form C). */}
      <div aria-hidden="true" className="h-[8px] shrink-0 bg-[image:var(--hazard-tape)]" />

      <div className="flex flex-col gap-[var(--s-3)] px-[var(--gutter)] pt-[var(--s-4)] pb-[var(--s-3)]">
        {/* Хват листа. Декоративный: тянуть его мы не умеем, но без него край листа
            читается как обрезанная страница, а не как поднятая панель. */}
        {!fill && (
          <span
            aria-hidden="true"
            className="mx-auto h-[4px] w-[40px] rounded-[var(--r-1)] bg-[var(--asphalt-500)] md:hidden"
          />
        )}
        <div className="flex items-start justify-between gap-[var(--s-3)]">
          <div className="flex min-w-0 flex-col gap-[var(--s-1)]">
            <h2 className="t-h2 uppercase">{title}</h2>
            {/* Подзаголовок обычным регистром, а не капслоком секции: здесь это фраза
                («Регистрация не нужна · 30 секунд»), а капслок в системе носят только
                короткие служебные ярлыки (Form C, readme › Visual foundations). */}
            {subtitle !== undefined && <p className="t-body text-[var(--text-2)]">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label={t('map.close')} className={ICON_BUTTON}>
            <Glyph name="close" />
          </button>
        </div>
      </div>

      {/* Отступа снизу нет, когда окно занимает экран: содержимое там несёт собственную
          панель действия на `sticky`, и она обязана прилипнуть к самому дну. Поле
          у прокручиваемого контейнера подняло бы её на свою высоту, и под ней осталась
          бы щель с проезжающим текстом. Воздух перед панелью даёт само содержимое. */}
      <div className={`min-h-0 overflow-auto px-[var(--gutter)] ${fill ? '' : 'pb-[var(--s-4)]'}`}>
        {children}
      </div>

      {footer !== undefined && (
        <div className="flex flex-col gap-[var(--s-2)] border-t border-[var(--border-1)] px-[var(--gutter)] pt-[var(--s-4)] pb-[calc(var(--screen-bottom)+var(--safe-bottom))]">
          {footer}
        </div>
      )}
    </dialog>
  )
}
