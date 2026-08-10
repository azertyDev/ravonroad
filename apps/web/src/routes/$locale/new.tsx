import type { CreateReportResponse } from '@ravonroad/shared-types'
import { useState } from 'react'
import { Confirmation } from '../../features/report-form/Confirmation'
import { ReportForm } from '../../features/report-form/ReportForm'

/** Единственный вход в систему: форма подачи заявки (SRS §7.1, US-006). */
export function NewReportPage() {
  const [created, setCreated] = useState<CreateReportResponse | null>(null)

  return created === null ? <ReportForm onCreated={setCreated} /> : <Confirmation report={created} />
}
