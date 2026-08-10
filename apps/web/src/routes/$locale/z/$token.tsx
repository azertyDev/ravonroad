import type { TrackView } from '@ravonroad/shared-types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { ReportSummary } from '../../../entities/report/ReportSummary'
import { apiErrorCode, apiFetch } from '../../../shared/api/client'
import { useI18n } from '../../../shared/i18n/useI18n'
import { ErrorState } from '../../../shared/ui/state/ErrorState'
import { LoadingState } from '../../../shared/ui/state/LoadingState'

/** Причины из глоссария. Код приходит с сервера и может оказаться из более новой версии,
 *  чем собранный клиент, — незнакомый показывается как «другое», а не пустой строкой. */
const REASONS = [
  'not_road_defect',
  'unreadable_photo',
  'spam',
  'ground_sinkhole',
  'utilities',
  'highway',
  'too_large',
  'other',
] as const

type ReasonKey = `reason.${(typeof REASONS)[number]}`

function reasonKey(code: string): ReasonKey {
  return (REASONS as readonly string[]).includes(code) ? (`reason.${code}` as ReasonKey) : 'reason.other'
}

/** Страница отслеживания (US-013).
 *
 *  Токен — единственная capability в системе (SRS §9.2): он показывает причину отказа,
 *  ссылку на оригинал дубля и кнопку удаления контактов. Самих контактов здесь нет —
 *  приходит только признак, что они есть (US-014).
 *
 *  Карта на этот маршрут не грузится: MapLibre подключается динамическим `import()`
 *  только там, где он нужен, и 322 КБ сюда не попадают (SRS §7.4). */
export function TrackPage() {
  const { token } = useParams({ from: '/$locale/z/$token' })
  const { locale, t } = useI18n()
  const client = useQueryClient()
  const [confirming, setConfirming] = useState(false)

  const view = useQuery({
    queryKey: ['track', token],
    queryFn: () => apiFetch<TrackView>(`/track/${token}`),
    // Ноль: житель обновляет эту страницу именно чтобы увидеть новое (SRS §7.5).
    staleTime: 0,
    retry: false,
  })

  const deleteContacts = useMutation({
    mutationFn: () => apiFetch<void>(`/track/${token}/contacts`, { method: 'DELETE' }),
    // Гасится только эта страница, и ничего больше: контакты нигде не показывались.
    onSuccess: () => client.invalidateQueries({ queryKey: ['track', token] }),
  })

  if (apiErrorCode(view.error) === 'NOT_FOUND') {
    // Одинаково для «не существовал» и «был удалён» (US-013).
    return (
      <p role="status" className="t-body-l">
        {t('track.notFound')}
      </p>
    )
  }

  if (view.isError) return <ErrorState code={apiErrorCode(view.error)} onRetry={() => void view.refetch()} />
  if (view.data === undefined) return <LoadingState />

  const report = view.data

  return (
    <article className="flex flex-col gap-[var(--block-gap)]">
      <h1 className="t-display">
        {t('track.title')} {report.displayNumber}
      </h1>

      {report.statusReason !== null && (
        <div className="flex flex-col gap-[var(--s-2)] rounded-[var(--r-3)] border border-[var(--border-1)] p-[var(--s-3)]">
          <p className="t-label">
            {t('track.reason')}: {t(reasonKey(report.statusReason))}
          </p>
          {report.statusReasonText !== null && (
            <>
              <p className="t-body-l">{report.statusReasonText}</p>
              {/* Свободный текст модератора не переводится и показывается как введён. */}
              <p className="t-caption text-[var(--text-2)]">{t('track.reasonOther')}</p>
            </>
          )}
        </div>
      )}

      {report.duplicateOfNumber !== null && (
        <Link
          to="/$locale/reports/$number"
          params={{ locale, number: String(report.duplicateOfNumber) }}
          className="t-label inline-flex min-h-[var(--touch-base)] items-center self-start"
        >
          {t('track.duplicateOf')}
        </Link>
      )}

      <ReportSummary report={report} />

      {/* Кнопки нет, когда контактов нет: удалять нечего, и предлагать это незачем. */}
      {report.hasContacts && (
        <section className="flex flex-col items-start gap-[var(--s-2)]">
          <p className="t-caption text-[var(--text-2)]">{t('track.contacts')}</p>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-[var(--s-3)]">
              <p className="t-caption">{t('track.deleteConfirm')}</p>
              <button
                type="button"
                onClick={() => deleteContacts.mutate()}
                disabled={deleteContacts.isPending}
                className="t-label inline-flex min-h-[var(--touch-base)] items-center rounded-[var(--r-2)] bg-[var(--accent)] px-[var(--s-5)] text-[var(--text-on-accent)]"
              >
                {t('track.deleteContacts')}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="t-label inline-flex min-h-[var(--touch-base)] items-center rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
              >
                {t('track.deleteCancel')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="t-label inline-flex min-h-[var(--touch-base)] items-center rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
            >
              {t('track.deleteContacts')}
            </button>
          )}
        </section>
      )}

      {deleteContacts.isSuccess && !report.hasContacts && (
        <p role="status" className="t-caption text-[var(--text-2)]">
          {t('track.deleted')}
        </p>
      )}
    </article>
  )
}
