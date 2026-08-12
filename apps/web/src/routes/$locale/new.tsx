import type { CreateReportResponse } from '@ravonroad/shared-types'
import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Confirmation } from '../../features/report-form/Confirmation'
import { ReportForm } from '../../features/report-form/ReportForm'
import { useI18n } from '../../shared/i18n/useI18n'
import { Sheet } from '../../shared/ui/control/Sheet'

/** Единственный вход в систему: форма подачи заявки (SRS §7.1, US-006).
 *
 *  Модальное окно поверх карты, а не отдельная страница (Desktop C): карта под затемнением
 *  остаётся той же самой — маршрут вложен в экран карты, — и отмена возвращает человека
 *  ровно туда, где он был, а не на заново загруженный город.
 *
 *  На телефоне окно занимает экран целиком: форма — работа на пять шагов, и полоска
 *  карты над ней ничего не даёт, а высоту отнимает (Form C — экран, а не лист).
 *
 *  Заголовок и подпись даёт окно, а не содержимое: два заголовка подряд — окна и формы —
 *  читались бы как сбой вёрстки. */
export function NewReportPage() {
  const { locale, t } = useI18n()
  const navigate = useNavigate()
  const [created, setCreated] = useState<CreateReportResponse | null>(null)

  const close = (): void => void navigate({ to: '/$locale', params: { locale } })

  return (
    <Sheet
      fill
      title={created === null ? t('form.title') : t('form.done.title')}
      subtitle={created === null ? t('home.ctaCaption') : t('form.done.lead')}
      onClose={close}
    >
      {created === null ? (
        <ReportForm onCreated={setCreated} onCancel={close} />
      ) : (
        <Confirmation report={created} />
      )}
    </Sheet>
  )
}
