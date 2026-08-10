import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { catalogKeys, fetchCategories, fetchDistricts, localizedName } from '../../../entities/catalog/api'
import { fetchReportDetail, reportKeys } from '../../../entities/report/api'
import { apiErrorCode } from '../../../shared/api/client'
import { formatDate, formatDateTime } from '../../../shared/format/date'
import { useI18n } from '../../../shared/i18n/useI18n'
import { ErrorState } from '../../../shared/ui/state/ErrorState'
import { LoadingState } from '../../../shared/ui/state/LoadingState'
import { StatusMark } from '../../../shared/ui/status/StatusMark'

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
  // Локаль берётся у хука, а не у параметров: он уже проверил её как `'uz' | 'ru'`,
  // и второй разбор того же сегмента разъехался бы с первым.
  const { locale, t } = useI18n()
  const parsed = Number(number)
  const isNumber = Number.isInteger(parsed) && parsed > 0

  const detail = useQuery({
    queryKey: reportKeys.detail(parsed),
    queryFn: () => fetchReportDetail(parsed),
    staleTime: DETAIL_STALE_TIME,
    enabled: isNumber,
  })
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: Infinity })

  const report = detail.data
  const notFound = !isNumber || apiErrorCode(detail.error) === 'NOT_FOUND'

  if (notFound) {
    return (
      <p role="status" className="t-body-l">
        {t('report.notPublished')}
      </p>
    )
  }

  if (detail.isError) {
    return <ErrorState code={apiErrorCode(detail.error)} onRetry={() => void detail.refetch()} />
  }

  if (report === undefined) return <LoadingState />

  const district = districts.data?.find((item) => item.code === report.districtCode)
  const category = categories.data?.find((item) => item.code === report.categoryCode)
  const before = report.photos.filter((photo) => photo.kind === 'BEFORE')
  const after = report.photos.filter((photo) => photo.kind === 'AFTER')

  return (
    <article className="flex flex-col gap-[var(--block-gap)]">
      <div className="flex flex-col gap-[var(--s-3)]">
        <h1 className="t-display">
          {t('report.title')} {report.displayNumber}
        </h1>
        <p className="t-label inline-flex items-center gap-[var(--s-2)]">
          <StatusMark status={report.status} />
          {t(`status.${report.status}`)}
        </p>
      </div>

      <section className="flex flex-col gap-[var(--s-3)]">
        <h2 className="t-h3">{t('report.photosBefore')}</h2>
        {before.length === 0 ? (
          <p className="t-caption text-[var(--text-2)]">{t('report.photosPending')}</p>
        ) : (
          <ul className="flex flex-wrap gap-[var(--s-3)]">
            {before.map((photo) => (
              <li key={photo.url}>
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img
                    src={photo.previewUrl}
                    alt={t('report.photoAlt')}
                    className="h-[160px] w-[160px] rounded-[var(--r-2)] object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {after.length > 0 && (
        <section className="flex flex-col gap-[var(--s-3)]">
          <h2 className="t-h3">{t('report.photosAfter')}</h2>
          <ul className="flex flex-wrap gap-[var(--s-3)]">
            {after.map((photo) => (
              <li key={photo.url}>
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img
                    src={photo.previewUrl}
                    alt={t('report.photoAfterAlt')}
                    className="h-[160px] w-[160px] rounded-[var(--r-2)] object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.publicationUrl !== null && (
        // Новая вкладка: житель пришёл смотреть заявку, а не уходить в соцсеть.
        <a
          href={report.publicationUrl}
          target="_blank"
          rel="noreferrer"
          className="t-label inline-flex min-h-[var(--touch-base)] items-center self-start rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
        >
          {t('report.publication')}
        </a>
      )}

      {/* Подпись перед значением: иначе <dl> не связывает пару, и скринридер читает
          значение без имени поля. */}
      <dl className="flex flex-col gap-[var(--s-3)]">
        {district !== undefined && (
          <div className="flex flex-col gap-[var(--s-1)]">
            <dt className="t-caption text-[var(--text-2)]">{t('report.district')}</dt>
            <dd className="t-body-l">{localizedName(district, locale)}</dd>
          </div>
        )}
        {category !== undefined && (
          <div className="flex flex-col gap-[var(--s-1)]">
            <dt className="t-caption text-[var(--text-2)]">{t('report.category')}</dt>
            <dd className="t-body-l">{localizedName(category, locale)}</dd>
          </div>
        )}
        {report.landmark !== null && (
          <div className="flex flex-col gap-[var(--s-1)]">
            <dt className="t-caption text-[var(--text-2)]">{t('report.landmark')}</dt>
            <dd className="t-body-l">{report.landmark}</dd>
          </div>
        )}
        <div className="flex flex-col gap-[var(--s-1)]">
          <dt className="t-caption text-[var(--text-2)]">{t('report.created')}</dt>
          <dd className="t-body-l tabular-nums">{formatDate(report.createdAt)}</dd>
        </div>
        {report.doneAt !== null && (
          <div className="flex flex-col gap-[var(--s-1)]">
            <dt className="t-caption text-[var(--text-2)]">{t('report.doneAt')}</dt>
            <dd className="t-body-l tabular-nums">{formatDate(report.doneAt)}</dd>
          </div>
        )}
      </dl>

      <section className="flex flex-col gap-[var(--s-3)]">
        <h2 className="t-h3">{t('report.history')}</h2>
        <ol className="flex flex-col gap-[var(--s-2)]">
          {report.history.map((entry) => (
            <li key={`${entry.at}-${entry.status}`} className="flex flex-wrap items-center gap-[var(--s-2)]">
              <StatusMark status={entry.status} />
              <span className="t-label">{t(`status.${entry.status}`)}</span>
              <span className="t-caption tabular-nums text-[var(--text-2)]">{formatDateTime(entry.at)}</span>
              {/* Отменённый переход остаётся в истории: она не переписывается задним
                  числом (PRD 5.3.4). */}
              {entry.undone && <span className="t-caption text-[var(--text-2)]">{t('report.undone')}</span>}
            </li>
          ))}
        </ol>
      </section>
    </article>
  )
}
