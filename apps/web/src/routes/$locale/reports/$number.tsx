import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { fetchReportDetail, reportKeys } from '../../../entities/report/api'
import { ReportSummary } from '../../../entities/report/ReportSummary'
import { apiErrorCode } from '../../../shared/api/client'
import { useI18n } from '../../../shared/i18n/useI18n'
import { ErrorState } from '../../../shared/ui/state/ErrorState'
import { LoadingState } from '../../../shared/ui/state/LoadingState'

/** Статус меняется редко (SRS §7.5). */
const DETAIL_STALE_TIME = 60_000

/** Публичная карточка заявки (US-004).
 *
 *  `REJECTED` и `DUPLICATE` сюда не доходят: сервер отвечает на них `404`, неотличимо
 *  от несуществующей заявки, и страница показывает то же самое, что и на выдуманный
 *  номер — «не опубликована». Скрывается не только содержимое, но и сам факт
 *  существования (SRS §9.2), поэтому битый номер в адресе рисуется так же, не запросом.
 *
 *  Контактов заявителя здесь нет и быть не может: они не приходят на клиент вовсе
 *  (PRD §6.2). */
export function ReportDetailPage() {
  const { number } = useParams({ from: '/$locale/reports/$number' })
  // Локаль берётся у хука, а не у параметров: он уже проверил её как `'uz' | 'ru'`.
  const { t } = useI18n()
  const parsed = Number(number)
  const isNumber = Number.isInteger(parsed) && parsed > 0

  const detail = useQuery({
    queryKey: reportKeys.detail(parsed),
    queryFn: () => fetchReportDetail(parsed),
    staleTime: DETAIL_STALE_TIME,
    enabled: isNumber,
  })

  if (!isNumber || apiErrorCode(detail.error) === 'NOT_FOUND') {
    return (
      <p role="status" className="t-body-l">
        {t('report.notPublished')}
      </p>
    )
  }

  if (detail.isError) {
    return <ErrorState code={apiErrorCode(detail.error)} onRetry={() => void detail.refetch()} />
  }

  if (detail.data === undefined) return <LoadingState />

  return (
    <article className="flex flex-col gap-[var(--block-gap)] px-[var(--gutter)]">
      <h1 className="t-display">
        {t('report.title')} {detail.data.displayNumber}
      </h1>
      <ReportSummary report={detail.data} />
    </article>
  )
}
