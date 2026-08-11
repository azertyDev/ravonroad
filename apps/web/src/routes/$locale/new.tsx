import type { CreateReportResponse } from '@ravonroad/shared-types'
import { useState } from 'react'
import { Confirmation } from '../../features/report-form/Confirmation'
import { ReportForm } from '../../features/report-form/ReportForm'

/** Единственный вход в систему: форма подачи заявки (SRS §7.1, US-006). */
export function NewReportPage() {
  const [created, setCreated] = useState<CreateReportResponse | null>(null)

  // Поле экрана держат сами блоки, а не маршрут: в форме и на подтверждении есть
  // плакатные полосы во всю ширину — жёлтое поле номера и полоса ошибки.
  return created === null ? <ReportForm onCreated={setCreated} /> : <Confirmation report={created} />
}
