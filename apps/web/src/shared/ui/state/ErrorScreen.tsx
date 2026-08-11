import type { ReactNode } from 'react'
import { Glyph } from '../icon/Glyph'
import { GUTTER } from '../control/styles'

interface ErrorScreenProps {
  title: string
  lead: string
  /** Кнопки уходят в нижнюю панель маршрута, а не сюда: главное действие живёт
   *  в нижней трети экрана, а не под текстом посреди страницы. */
  children?: ReactNode
}

/** Отказ во весь экран: карта не загрузилась, заявка не открылась.
 *
 *  Отдельно от компактного `ErrorState`: тот стоит поверх карты и внутри списка, где
 *  плакатный кегль просто не поместится. Один компонент на оба места пришлось бы
 *  настраивать пропом размера, а это два разных сообщения, а не два размера одного.
 *
 *  Красный квадрат здесь допустим: статусов на этом экране нет, и спутать его
 *  с REJECTED не с чем. */
export function ErrorScreen({ title, lead, children }: ErrorScreenProps) {
  return (
    <div role="alert" className={`flex flex-1 flex-col items-start justify-center gap-[var(--s-5)] py-[var(--s-10)] ${GUTTER}`}>
      <span
        aria-hidden="true"
        className="grid h-[56px] w-[56px] place-items-center rounded-[var(--r-4)] bg-[var(--status-rejected-pin)] text-[#FFFFFF]"
      >
        <Glyph name="close" size={24} />
      </span>
      <h1 className="t-display uppercase">{title}</h1>
      <p className="t-body text-[var(--text-2)]">{lead}</p>
      {children}
    </div>
  )
}
