import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchReportDetail, reportKeys } from '../../../entities/report/api'
import { ReportSummary } from '../../../entities/report/ReportSummary'
import { apiErrorCode } from '../../../shared/api/client'
import { useI18n } from '../../../shared/i18n/useI18n'
import { useOnline } from '../../../shared/lib/useOnline'
import { ActionBar } from '../../../shared/ui/control/ActionBar'
import { ShareButton } from '../../../shared/ui/control/ShareButton'
import { CTA, GUTTER, SECONDARY } from '../../../shared/ui/control/styles'
import { Glyph } from '../../../shared/ui/icon/Glyph'
import { PageHead } from '../../../shared/ui/layout/PageHead'
import { ErrorScreen } from '../../../shared/ui/state/ErrorScreen'
import { LoadingState } from '../../../shared/ui/state/LoadingState'
import { OfflineBar } from '../../../shared/ui/state/OfflineBar'

/** Статус меняется редко (SRS §7.5). */
const DETAIL_STALE_TIME = 60_000

const COPIED_FOR_MS = 2000

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
  const { locale, t, errorText } = useI18n()
  const online = useOnline()
  const [copied, setCopied] = useState(false)
  const parsed = Number(number)
  const isNumber = Number.isInteger(parsed) && parsed > 0

  const detail = useQuery({
    queryKey: reportKeys.detail(parsed),
    queryFn: () => fetchReportDetail(parsed),
    staleTime: DETAIL_STALE_TIME,
    enabled: isNumber,
  })

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS)
    return () => clearTimeout(timer)
  }, [copied])

  if (!isNumber || apiErrorCode(detail.error) === 'NOT_FOUND') {
    return (
      <ErrorScreen title={t('report.notPublished')} lead={t('map.empty.hint')}>
        <Link to="/$locale" params={{ locale }} className={`${SECONDARY} w-auto`}>
          {t('form.done.backToMap')}
        </Link>
      </ErrorScreen>
    )
  }

  if (detail.isError && detail.data === undefined) {
    return (
      <ErrorScreen title={t('state.errorTitle')} lead={errorText(apiErrorCode(detail.error) ?? 'INTERNAL_ERROR')}>
        <button type="button" onClick={() => void detail.refetch()} className={`${SECONDARY} w-auto`}>
          {t('state.offline.refresh')}
        </button>
      </ErrorScreen>
    )
  }

  if (detail.data === undefined) {
    return (
      <div className={GUTTER}>
        <LoadingState />
      </div>
    )
  }

  const report = detail.data

  return (
    <article className="flex flex-1 flex-col">
      <PageHead title={report.displayNumber} action={<ShareButton title={report.displayNumber} />} />

      {/* Связи нет, а страница уже приехала: показанное — сохранённая версия, а не
          свежая. Молчать об этом нельзя, но и ошибкой это не является. */}
      {!online && <OfflineBar onRetry={() => void detail.refetch()} />}

      <ReportSummary report={report} />

      <ActionBar caption={t('footer.volunteers')}>
        <button
          type="button"
          className={CTA}
          onClick={() => {
            void navigator.clipboard.writeText(globalThis.location.href).then(
              () => setCopied(true),
              // Буфер недоступен без https и в части браузеров: адрес остаётся
              // в строке браузера, и скопировать его можно оттуда.
              () => undefined,
            )
          }}
        >
          <Glyph name="copy" size={18} />
          {copied ? t('report.copied') : t('report.copyLink')}
        </button>
      </ActionBar>
    </article>
  )
}
