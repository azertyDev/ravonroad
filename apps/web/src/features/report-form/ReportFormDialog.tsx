import type { CreateReportResponse } from '@ravonroad/shared-types'
import { createContext, use, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../../shared/i18n/useI18n'
import { Sheet } from '../../shared/ui/control/Sheet'
import { Confirmation } from './Confirmation'
import { ReportForm } from './ReportForm'

const OpenReportForm = createContext<(() => void) | null>(null)

/** Открыть форму заявки поверх текущей страницы. */
export function useReportForm(): () => void {
  const open = use(OpenReportForm)
  // Сообщение разработчику, поэтому по-английски: жителю оно не показывается никогда,
  // а в разметке экранов русских строк не остаётся вовсе (screens.test.ts).
  if (open === null) throw new Error('useReportForm used outside ReportFormProvider')
  return open
}

/** Форма подачи — окно поверх страницы, а не маршрут (US-006).
 *
 *  Маршрутом она была, и это стоило человеку места: `/uz/new` жил ребёнком карты,
 *  поэтому нажатие «сообщить о яме» со страницы заявки уносило со страницы заявки
 *  на главную. Заявка, которую человек читал, исчезала — а он всего лишь хотел
 *  добавить соседнюю яму.
 *
 *  Отсюда состояние вместо адреса: окно открывается там, где стоит человек, и закрытие
 *  возвращает ровно туда же — на карту, в список, в карточку. Ценой стала ссылка на
 *  пустую форму: её больше нет и делиться нечем. Делятся у нас заявкой и срезом карты,
 *  а форму открывают кнопкой, которая есть на каждом экране. */
export function ReportFormProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<CreateReportResponse | null>(null)

  // Значение контекста стабильно между рендерами: иначе каждое открытие окна
  // перерисовывало бы всё дерево страницы под ним.
  const show = useMemo(
    () => () => {
      setCreated(null)
      setOpen(true)
    },
    [],
  )

  return (
    <OpenReportForm value={show}>
      {children}
      {open && (
        <Sheet
          fill
          title={created === null ? t('form.title') : t('form.done.title')}
          subtitle={created === null ? t('home.ctaCaption') : t('form.done.lead')}
          onClose={() => setOpen(false)}
        >
          {created === null ? (
            <ReportForm onCreated={setCreated} onCancel={() => setOpen(false)} />
          ) : (
            <Confirmation report={created} />
          )}
        </Sheet>
      )}
    </OpenReportForm>
  )
}
