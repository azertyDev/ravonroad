import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { catalogKeys, fetchDistricts, localizedName } from '../../../entities/catalog/api'
import { fetchReportList, fetchReportMap, reportKeys, type ReportFilters as Filters } from '../../../entities/report/api'
import { ReportFilters } from '../../../features/report-filters/ReportFilters'
import { toFilters, toSearch } from '../../../features/report-filters/searchParams'
import { CITY_BBOX } from '../../../features/report-map/bbox'
import { PublicMap } from '../../../features/report-map/PublicMap'
import { apiErrorCode } from '../../../shared/api/client'
import { formatDate } from '../../../shared/format/date'
import { formatNumber } from '../../../shared/format/number'
import { useI18n } from '../../../shared/i18n/useI18n'
import { ErrorState } from '../../../shared/ui/state/ErrorState'
import { LoadingState } from '../../../shared/ui/state/LoadingState'
import { StatusMark } from '../../../shared/ui/status/StatusMark'

const LIST_STALE_TIME = 30_000

/** Список заявок (US-003, US-031, US-033).
 *
 *  Не запасной вариант карты, а равноправный вход: карта не должна быть единственным
 *  способом увидеть заявки (PRD §8.2). Фильтр один на оба — и набор поэтому один и тот же.
 *
 *  Счётчик по району берётся из ответа карты с тем же фильтром: тот запрос всё равно
 *  сделан, лежит в кэше и обслуживается микрокэшем nginx, поэтому отдельного
 *  «сколько всего» не требуется (SRS §4.3 — `total` в списке всегда `null`). */
export function ReportListPage() {
  const { locale, t } = useI18n()
  const search = useSearch({ from: '/$locale/reports' })
  const navigate = useNavigate({ from: '/$locale/reports' })
  const filters = toFilters(search)

  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const district = districts.data?.find((item) => item.code === filters.district)

  const list = useInfiniteQuery({
    queryKey: reportKeys.list(filters),
    queryFn: ({ pageParam }) => fetchReportList(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: LIST_STALE_TIME,
  })

  const counted = useQuery({
    queryKey: reportKeys.map(CITY_BBOX, filters),
    queryFn: () => fetchReportMap(CITY_BBOX, filters),
    staleTime: LIST_STALE_TIME,
  })

  const items = (list.data?.pages ?? []).flatMap((page) => page.items)
  const applied = [
    ...filters.status.map((status) => t(`status.${status}`)),
    district === undefined ? null : localizedName(district, locale),
    filters.from,
    filters.to,
  ].filter((value): value is string => value !== null && value !== undefined)

  return (
    <div className="flex flex-col gap-[var(--block-gap)]">
      <h1 className="t-display">{t('list.title')}</h1>

      <ReportFilters
        filters={filters}
        onChange={(next: Filters) => void navigate({ search: toSearch(next) })}
      />

      {/* Выбор района подгоняет границы карты, а рядом видно, сколько в нём заявок. */}
      {district !== undefined && counted.data !== undefined && (
        <p className="t-label">
          {t('list.districtCount')}: <span className="tabular-nums">{formatNumber(counted.data.points.length)}</span>
        </p>
      )}

      <PublicMap filters={filters} focus={district?.bbox ?? null} />

      {list.isPending && <LoadingState />}
      {list.isError && <ErrorState code={apiErrorCode(list.error)} onRetry={() => void list.refetch()} />}

      {list.isSuccess && items.length === 0 && (
        <div className="flex flex-col items-start gap-[var(--s-3)]">
          <p className="t-body-l">{t('list.empty')}</p>
          {applied.length > 0 && <p className="t-caption text-[var(--text-2)]">{applied.join(' · ')}</p>}
          <button
            type="button"
            onClick={() => void navigate({ search: {} })}
            className="t-label inline-flex min-h-[var(--touch-base)] items-center rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
          >
            {t('filters.reset')}
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-[var(--s-3)]">
        {items.map((item) => (
          <li key={item.number}>
            <Link
              to="/$locale/reports/$number"
              params={{ locale, number: String(item.number) }}
              className="flex gap-[var(--s-3)] rounded-[var(--r-3)] border border-[var(--border-1)] bg-[var(--surface-card)] p-[var(--s-3)]"
            >
              {item.previewUrl === null ? (
                <span className="t-caption grid h-[72px] w-[72px] shrink-0 place-items-center rounded-[var(--r-2)] bg-[var(--surface-sunken)] text-center text-[var(--text-2)]">
                  {t('report.photosPending')}
                </span>
              ) : (
                <img
                  src={item.previewUrl}
                  alt={t('report.photoAlt')}
                  className="h-[72px] w-[72px] shrink-0 rounded-[var(--r-2)] object-cover"
                />
              )}
              <span className="flex min-w-0 flex-col gap-[var(--s-1)]">
                <span className="t-label inline-flex items-center gap-[var(--s-2)]">
                  <StatusMark status={item.status} />
                  {t(`status.${item.status}`)}
                </span>
                <span className="t-caption text-[var(--text-2)]">{item.displayNumber}</span>
                {item.landmark !== null && <span className="t-caption">{item.landmark}</span>}
                <span className="t-caption tabular-nums text-[var(--text-2)]">{formatDate(item.createdAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {list.hasNextPage && (
        <button
          type="button"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
          className="t-label inline-flex min-h-[var(--touch-base)] items-center self-start rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
        >
          {list.isFetchingNextPage ? t('state.loading') : t('list.more')}
        </button>
      )}
    </div>
  )
}
