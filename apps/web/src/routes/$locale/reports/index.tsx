import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { catalogKeys, fetchDistricts, localizedName } from '../../../entities/catalog/api'
import { ReportCard } from '../../../entities/report/ReportCard'
import { fetchReportList, fetchReportMap, reportKeys, type ReportFilters as Filters } from '../../../entities/report/api'
import { FilterBar } from '../../../features/report-filters/FilterBar'
import { ReportFilters } from '../../../features/report-filters/ReportFilters'
import { toFilters, toSearch } from '../../../features/report-filters/searchParams'
import { CITY_BBOX } from '../../../features/report-map/bbox'
import { PublicMap } from '../../../features/report-map/PublicMap'
import { useCampaignStats } from '../../../features/stats/useCampaignStats'
import { apiErrorCode } from '../../../shared/api/client'
import { formatNumber } from '../../../shared/format/number'
import { useI18n } from '../../../shared/i18n/useI18n'
import { ActionBar } from '../../../shared/ui/control/ActionBar'
import { COMPACT, CTA, GUTTER, SECONDARY } from '../../../shared/ui/control/styles'
import { EmptyState } from '../../../shared/ui/state/EmptyState'
import { ErrorState } from '../../../shared/ui/state/ErrorState'
import { LoadingState } from '../../../shared/ui/state/LoadingState'

const LIST_STALE_TIME = 30_000

/** Список заявок (US-003, US-031, US-033).
 *
 *  Не запасной вариант карты, а равноправный вход: карта не должна быть единственным
 *  способом увидеть заявки (PRD §8.2). Фильтр один на оба — и набор поэтому один и тот же.
 *
 *  Список идёт под картой, а не в листе поверх неё, как в макете: лист над картой
 *  нужен там, где карта и есть страница, а здесь страница и есть список — накрывать
 *  им собственное содержимое незачем. В лист вынесены фильтры: их форма длинная,
 *  и на телефоне она отжимала бы и карту, и список за нижний край.
 *
 *  Счётчик по срезу берётся из ответа карты с тем же фильтром: тот запрос всё равно
 *  сделан, лежит в кэше и обслуживается микрокэшем nginx, поэтому отдельного
 *  «сколько всего» не требуется (SRS §4.3 — `total` в списке всегда `null`). */
export function ReportListPage() {
  const { locale, t } = useI18n()
  const search = useSearch({ from: '/$locale/reports' })
  const navigate = useNavigate({ from: '/$locale/reports' })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filters = toFilters(search)

  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const stats = useCampaignStats()
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
  const apply = (next: Filters): void => void navigate({ search: toSearch(next) })

  return (
    // Ноутбук: карта слева во всю высоту, срез справа — та же раскладка, что у главной,
    // и тот же порядок блоков на телефоне. Второго дерева разметки нет, порядок задан
    // `order` (Desktop C › «Bosh sahifa»).
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[1fr_420px] lg:items-start lg:gap-[var(--s-8)]">
      <div className={`order-1 flex flex-col gap-[var(--s-4)] lg:order-2 ${GUTTER} lg:px-0`}>
        <h1 className="t-display uppercase">{t('list.title')}</h1>
        <FilterBar filters={filters} onChange={apply} onOpen={() => setFiltersOpen(true)} />
      </div>

      {filtersOpen && (
        <ReportFilters
          filters={filters}
          onChange={apply}
          onClose={() => setFiltersOpen(false)}
          count={counted.data?.points.length}
        />
      )}

      {/* Выбор района подгоняет границы карты. Пусто по фильтрам — сообщение ложится
          поверх карты, а не вместо неё: человек должен видеть, куда сдвинуться. */}
      <div className="relative order-2 mt-[var(--s-5)] lg:order-1 lg:sticky lg:top-[var(--s-4)] lg:mt-0">
        <PublicMap
          filters={filters}
          focus={district?.bbox ?? null}
          className="h-[46vh] min-h-[280px] lg:h-[calc(100dvh-160px)] lg:min-h-[420px] lg:rounded-[var(--r-4)] lg:border lg:border-[var(--border-1)]"
        />
        {list.isSuccess && items.length === 0 && (
          <div className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 ${GUTTER}`}>
            <div className="pointer-events-auto">
              <EmptyState title={t('map.empty.title')} hint={t('map.empty.hint')}>
                <button type="button" onClick={() => void navigate({ search: {} })} className={`${SECONDARY} mt-[var(--s-2)]`}>
                  {t('filters.reset')}
                </button>
              </EmptyState>
            </div>
          </div>
        )}
      </div>

      <div className={`order-3 mt-[var(--s-5)] flex flex-col gap-[var(--s-3)] lg:order-3 lg:col-start-2 lg:mt-0 ${GUTTER} lg:px-0`}>
        {/* Число по району — из разбивки, а не из точек карты: точки ограничены видимой
            областью и обрезаются потолком выдачи, а тут нужно «сколько всего в районе». */}
        {district !== undefined && stats.data !== undefined && (
          <p className="t-section text-[var(--text-2)]">
            {localizedName(district, locale)} ·{' '}
            <span className="tabular-nums">{formatNumber(stats.data.byDistrict[district.code] ?? 0)}</span>
          </p>
        )}

        {list.isPending && <LoadingState />}
        {list.isError && <ErrorState code={apiErrorCode(list.error)} onRetry={() => void list.refetch()} />}

        <ul className="flex flex-col gap-[var(--s-3)] empty:hidden">
          {items.map((item) => (
            <li key={item.number}>
              <ReportCard item={item} locale={locale} />
            </li>
          ))}
        </ul>

        {list.hasNextPage && (
          <button
            type="button"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
            className={`${COMPACT} self-start`}
          >
            {list.isFetchingNextPage ? t('state.loading') : t('list.more')}
          </button>
        )}
      </div>

      {/* На ноутбуке действие уже стоит в шапке, и вторая кнопка во всю ширину внизу —
          то же самое действие, набранное вчетверо крупнее. Прячется тем же правилом,
          что и на главной: панель принадлежит телефону, где кнопка живёт под большим
          пальцем, а в шапке её нет. */}
      <ActionBar caption={t('home.ctaCaption')} className="order-4 lg:hidden">
        <Link to="/$locale/new" params={{ locale }} className={CTA}>
          {t('home.cta')}
        </Link>
      </ActionBar>
    </div>
  )
}
