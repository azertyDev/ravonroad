import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { fetchReportDetail, reportKeys } from '../../../entities/report/api'
import { useReportForm } from '../../../features/report-form/ReportFormDialog'
import { ReportSummary } from '../../../entities/report/ReportSummary'
import { apiErrorCode } from '../../../shared/api/client'
import { useI18n } from '../../../shared/i18n/useI18n'
import { usePageMeta } from '../../../shared/lib/usePageMeta'
import { useOnline } from '../../../shared/lib/useOnline'
import { ActionBar } from '../../../shared/ui/control/ActionBar'
import { ShareButton } from '../../../shared/ui/control/ShareButton'
import { COMPACT, COMPACT_ACCENT, CTA, GUTTER, SECONDARY } from '../../../shared/ui/control/styles'
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
  const openForm = useReportForm()
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

  // Номер в заголовке вкладки: по нему заявку находят среди десяти открытых вкладок,
  // и он же уходит в закладку. Хук стоит до ранних возвратов — правило хуков.
  usePageMeta(
    detail.data === undefined ? t('meta.report.title') : `${detail.data.displayNumber} · ${t('meta.report.title')}`,
    t('meta.report.description'),
  )

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS)
    return () => clearTimeout(timer)
  }, [copied])

  if (!isNumber || apiErrorCode(detail.error) === 'NOT_FOUND') {
    return (
      <ErrorScreen title={t('report.notPublished')} lead={t('report.notPublished.hint')}>
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

  const copy = (): void => {
    void navigator.clipboard.writeText(globalThis.location.href).then(
      () => setCopied(true),
      // Буфер недоступен без https и в части браузеров: адрес остаётся
      // в строке браузера, и скопировать его можно оттуда.
      () => undefined,
    )
  }

  return (
    // Ноутбук: карточка заявки и колонка «где это» стоят в колонке 1120 px по центру,
    // а не во всю ширину карточки экрана (Desktop C › экран 3).
    <article className="flex flex-1 flex-col lg:mx-auto lg:w-full lg:max-w-[1120px]">
      {/* Номер и действия в одной строке: на телефоне «поделиться» системным листом,
          на ноутбуке — копирование ссылки и новая заявка, как в макете. Лист там
          не открывается, а копирование в шапке заменяет нижнюю панель. */}
      <PageHead
        title={report.displayNumber}
        action={
          <>
            <span className="lg:hidden">
              <ShareButton title={report.displayNumber} />
            </span>
            <span className="hidden gap-[var(--s-2)] lg:flex">
              <button type="button" onClick={copy} className={COMPACT}>
                <Glyph name="copy" size={14} />
                {copied ? t('report.copied') : t('report.copyLink')}
              </button>
              <button type="button" onClick={openForm} className={COMPACT_ACCENT}>
                <Glyph name="plus" size={14} />
                {t('report.newReport')}
              </button>
            </span>
          </>
        }
      />

      {/* Связи нет, а страница уже приехала: показанное — сохранённая версия, а не
          свежая. Молчать об этом нельзя, но и ошибкой это не является. */}
      {!online && <OfflineBar onRetry={() => void detail.refetch()} />}

      <ReportSummary report={report} />

      {/* Нижняя панель — только на телефоне: на ноутбуке те же действия стоят в строке
          с номером, а «показать на карте» — под мини-картой в правой колонке.
          Без подписи: «проект ведут волонтёры» уже стоит в подвале страницей ниже,
          и второй раз подряд эта строка читается как сбой вёрстки, а не как строка. */}
      <ActionBar className="lg:hidden">
        <button type="button" className={CTA} onClick={copy}>
          <Glyph name="copy" size={18} />
          {copied ? t('report.copied') : t('report.copyLink')}
        </button>
      </ActionBar>
    </article>
  )
}
