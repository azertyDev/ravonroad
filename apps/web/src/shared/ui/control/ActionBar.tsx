import type { ReactNode } from 'react'

interface ActionBarProps {
  children: ReactNode
  /** Строка под кнопкой: чего не хватает, сколько это займёт, кто ведёт проект.
   *  Всегда одна и всегда обычным регистром — капслок на ней уже не читается. */
  caption?: string
}

/** Нижняя панель действия. Главное действие живёт в нижней трети экрана и не уезжает
 *  из-под большого пальца при прокрутке (readme › Раскладка).
 *
 *  `sticky`, а не `fixed`: панель принадлежит содержимому маршрута, а не каркасу —
 *  на главной это «сообщить о яме», в форме «отправить», на странице заявки
 *  «показать на карте». `fixed` вырвал бы её из потока, и подвал сайта пришлось бы
 *  вечно отодвигать на её высоту вручную. Прилипание кончается на дне `main`,
 *  поэтому панель никогда не накрывает подвал.
 *
 *  Отступ снизу считается с `env(safe-area-inset-bottom)`: на телефоне с домашней
 *  полосой кнопка иначе оказывается наполовину под ней. */
export function ActionBar({ children, caption }: ActionBarProps) {
  return (
    <div className="sticky bottom-0 z-10 mt-[var(--block-gap)] flex flex-col gap-[var(--s-2)] border-t border-[var(--border-1)] bg-[var(--surface-page)] px-[var(--gutter)] pt-[var(--s-4)] pb-[calc(var(--screen-bottom)+var(--safe-bottom))]">
      {children}
      {caption !== undefined && (
        <p className="t-caption text-center text-[var(--text-2)]">{caption}</p>
      )}
    </div>
  )
}
