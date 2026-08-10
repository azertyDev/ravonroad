import type { CreateReportResponse } from '@ravonroad/shared-types'
import { useState } from 'react'
import { ReportForm } from '../../features/report-form/ReportForm'
import { useI18n } from '../../shared/i18n/useI18n'

/** Единственный вход в систему: форма подачи заявки (SRS §7.1, US-006). */
export function NewReportPage() {
  const { t } = useI18n()
  const [created, setCreated] = useState<CreateReportResponse | null>(null)

  if (created === null) return <ReportForm onCreated={setCreated} />

  return (
    <section className="flex flex-col gap-[var(--block-gap)]">
      <h1 className="t-h1">{t('form.done.title')}</h1>

      <div className="flex flex-col gap-[var(--s-1)]">
        <p className="t-label text-[var(--text-2)]">{t('form.done.numberLabel')}</p>
        <p className="t-counter">{created.displayNumber}</p>
      </div>

      <div className="flex flex-col gap-[var(--s-2)]">
        <p className="t-label text-[var(--text-2)]">{t('form.done.linkLabel')}</p>
        {/* Обычная ссылка, а не Link роутера: страница отслеживания приходит в 003,
            и типизированного маршрута для неё пока не существует. Путь при этом
            настоящий — его собрал сервер в локали жителя (SRS §4.2). */}
        <a href={created.trackingPath} className="t-body break-all underline">
          {created.trackingPath}
        </a>
        {/* Токен не восстановить: он случайный и нигде больше не показывается (US-012). */}
        <p className="t-caption text-[var(--text-2)]">{t('form.done.warning')}</p>
      </div>
    </section>
  )
}
