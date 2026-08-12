import {
  OUT_OF_SCOPE_REASON_CODES,
  REJECT_REASON_CODES,
  type StatusReasonCode,
  type TrackView,
} from '@ravonroad/shared-types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ReportSummary } from '../../../entities/report/ReportSummary'
import { apiErrorCode, apiFetch } from '../../../shared/api/client'
import { useI18n } from '../../../shared/i18n/useI18n'
import { usePageMeta } from '../../../shared/lib/usePageMeta'
import { useOnline } from '../../../shared/lib/useOnline'
import { ActionBar } from '../../../shared/ui/control/ActionBar'
import { COMPACT, CTA, GUTTER, SECONDARY } from '../../../shared/ui/control/styles'
import { Glyph } from '../../../shared/ui/icon/Glyph'
import { PageHead } from '../../../shared/ui/layout/PageHead'
import { ErrorScreen } from '../../../shared/ui/state/ErrorScreen'
import { LoadingState } from '../../../shared/ui/state/LoadingState'
import { OfflineBar } from '../../../shared/ui/state/OfflineBar'

/** Список кодов — из контракта, а не свой: причины объявляет машина состояний, и вторая
 *  копия здесь разъехалась бы с ней молча. Код приходит с сервера и может оказаться
 *  из более новой версии, чем собранный клиент, — незнакомый показывается как «другое»,
 *  а не пустой строкой. */
const REASONS: readonly string[] = [...REJECT_REASON_CODES, ...OUT_OF_SCOPE_REASON_CODES]

type ReasonKey = `reason.${StatusReasonCode}`

function reasonKey(code: string): ReasonKey {
  return REASONS.includes(code) ? (`reason.${code}` as ReasonKey) : 'reason.other'
}

const COPIED_FOR_MS = 2000

/** Страница отслеживания (US-013).
 *
 *  Токен — единственная capability в системе (SRS §9.2): он показывает причину отказа,
 *  ссылку на оригинал дубля и кнопку удаления контактов. Самих контактов здесь нет —
 *  приходит только признак, что они есть (US-014).
 *
 *  Тело карточки то же самое, что на публичной странице, и это намеренно: житель на
 *  своей странице должен видеть ровно то, что показано всем, плюс причину отказа.
 *
 *  Карта на этот маршрут не грузится: MapLibre подключается динамическим `import()`
 *  только там, где он нужен, и 322 КБ сюда не попадают (SRS §7.4). */
export function TrackPage() {
  const { token } = useParams({ from: '/$locale/z/$token' })
  const { locale, t, errorText } = useI18n()
  const client = useQueryClient()
  const online = useOnline()
  const [confirming, setConfirming] = useState(false)
  const [copied, setCopied] = useState(false)

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

  usePageMeta(
    view.data === undefined ? t('meta.track.title') : `${view.data.displayNumber} · ${t('meta.track.title')}`,
    t('meta.track.description'),
  )

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS)
    return () => clearTimeout(timer)
  }, [copied])

  if (apiErrorCode(view.error) === 'NOT_FOUND') {
    // Одинаково для «не существовал» и «был удалён» (US-013).
    return (
      <ErrorScreen title={t('track.notFound')} lead={t('report.trackHint')}>
        <Link to="/$locale" params={{ locale }} className={`${SECONDARY} w-auto`}>
          {t('form.done.backToMap')}
        </Link>
      </ErrorScreen>
    )
  }

  if (view.isError && view.data === undefined) {
    return (
      <ErrorScreen title={t('state.errorTitle')} lead={errorText(apiErrorCode(view.error) ?? 'INTERNAL_ERROR')}>
        <button type="button" onClick={() => void view.refetch()} className={`${SECONDARY} w-auto`}>
          {t('state.offline.refresh')}
        </button>
      </ErrorScreen>
    )
  }

  if (view.data === undefined) {
    return (
      <div className={GUTTER}>
        <LoadingState />
      </div>
    )
  }

  const report = view.data

  return (
    // Ширина и верхнее поле — те же, что у публичной страницы заявки: тело карточки
    // здесь то же самое, и в 820 пикселях его левая колонка ужималась до трети экрана,
    // хотя рядом пустовало полокна.
    <article className="flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[1440px] lg:pt-[var(--s-5)]">
      <PageHead title={report.displayNumber} />
      {!online && <OfflineBar onRetry={() => void view.refetch()} />}

      <ReportSummary
        report={report}
        note={
          (report.statusReason !== null || report.duplicateOfNumber !== null) && (
            <div className={`flex flex-col items-start gap-[var(--s-3)] pb-[var(--s-5)] ${GUTTER}`}>
              {report.statusReason !== null && (
                <div className="flex w-full flex-col gap-[var(--s-2)] rounded-[var(--r-4)] border border-[var(--border-1)] bg-[var(--surface-sunken)] p-[var(--s-4)]">
                  <p className="t-section text-[var(--text-2)]">{t('track.reason')}</p>
                  <p className="t-body">{t(reasonKey(report.statusReason))}</p>
                  {report.statusReasonText !== null && (
                    <>
                      <p className="t-body">{report.statusReasonText}</p>
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
                  className={COMPACT}
                >
                  {t('track.duplicateOf')}
                </Link>
              )}
            </div>
          )
        }
      />

      {/* Кнопки нет, когда контактов нет: удалять нечего, и предлагать это незачем. */}
      {report.hasContacts && (
        <section className={`flex flex-col items-start gap-[var(--s-3)] pb-[var(--s-5)] ${GUTTER}`}>
          <p className="t-caption text-[var(--text-2)]">{t('track.contacts')}</p>
          {confirming ? (
            <div className="flex w-full flex-col gap-[var(--s-3)] rounded-[var(--r-4)] border border-[var(--status-rejected-line)] bg-[var(--status-rejected-tint)] p-[var(--s-4)]">
              <p className="t-caption text-[var(--status-rejected-ink)]">{t('track.deleteConfirm')}</p>
              <div className="flex flex-wrap gap-[var(--s-3)]">
                <button
                  type="button"
                  onClick={() => deleteContacts.mutate()}
                  disabled={deleteContacts.isPending}
                  className={COMPACT}
                >
                  {t('track.deleteContacts')}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={COMPACT}>
                  {t('track.deleteCancel')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={COMPACT}>
              {t('track.deleteContacts')}
            </button>
          )}
        </section>
      )}

      {deleteContacts.isSuccess && !report.hasContacts && (
        <p role="status" className={`t-caption pb-[var(--s-5)] text-[var(--text-2)] ${GUTTER}`}>
          {t('track.deleted')}
        </p>
      )}

      <ActionBar caption={t('report.trackHint')}>
        <button
          type="button"
          className={CTA}
          onClick={() => {
            void navigator.clipboard.writeText(globalThis.location.href).then(
              () => setCopied(true),
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
