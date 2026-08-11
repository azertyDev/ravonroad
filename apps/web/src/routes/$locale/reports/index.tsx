import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { catalogKeys, fetchDistricts, localizedName } from '../../../entities/catalog/api'
import { ReportCard } from '../../../entities/report/ReportCard'
import { ReportRow, ROW_COLUMNS } from '../../../entities/report/ReportRow'
import { fetchReportList, fetchReportMap, reportKeys, type ReportFilters as Filters } from '../../../entities/report/api'
import { FilterBar } from '../../../features/report-filters/FilterBar'
import { ReportFilters } from '../../../features/report-filters/ReportFilters'
import { toFilters, toSearch } from '../../../features/report-filters/searchParams'
import { CITY_BBOX } from '../../../features/report-map/bbox'
import { PublicMap } from '../../../features/report-map/PublicMap'
import { listTotal } from '../../../features/stats/listTotal'
import { useCampaignStats } from '../../../features/stats/useCampaignStats'
import { apiErrorCode } from '../../../shared/api/client'
import { formatNumber } from '../../../shared/format/number'
import { useI18n } from '../../../shared/i18n/useI18n'
import { useDesktop } from '../../../shared/lib/useDesktop'
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
  const { locale, t, tp } = useI18n()
  // Таблица живёт только на ноутбуке, и карта на нём уступает ей место целиком
  // (Desktop C › экран 1b). Классом `lg:hidden` этого не сделать: спрятанная карта
  // всё равно создаётся и тянет тайлы.
  const desktop = useDesktop()
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
  const total = listTotal(filters, stats.data)
  const apply = (next: Filters): void => void navigate({ search: toSearch(next) })

  return (
    // Телефон: заголовок, фильтры, карта, карточки. Ноутбук: карта уступает место
    // таблице целиком, и колонок больше нет — экран становится одним столбцом
    // (Desktop C › экран 1b).
    <div className="flex flex-1 flex-col">
      <div className={`order-1 flex flex-col gap-[var(--s-4)] ${GUTTER} lg:px-[var(--s-6)]`}>
        <h1 className="t-display uppercase lg:sr-only">{t('list.title')}</h1>
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
      {!desktop && (
      <div className="relative order-2 mt-[var(--s-5)]">
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
      )}

      {/* Жёлтая полоса над таблицей: сколько заявок в срезе и вход обратно на карту.
          Число берётся из разбивки `/api/stats` и только там, где срез ложится на одну
          её ось; иначе печатается «показано N» по загруженным строкам — это правда
          всегда, а выдуманного числа на публичном сайте кампании быть не должно. */}
      {desktop && (
        <div className="order-2 flex items-center justify-between gap-[var(--s-6)] bg-[var(--accent)] px-[var(--s-6)] py-[var(--s-4)] text-[var(--text-on-accent)]">
          <p className="t-h3 font-extrabold uppercase">
            <span className="tabular-nums">{formatNumber(total ?? items.length)}</span>{' '}
            {tp('map.reports', total ?? items.length)} {total === null ? t('list.shown') : t('list.inList')}
          </p>
          <nav className="flex shrink-0 overflow-hidden rounded-[var(--r-3)]">
            <Link
              to="/$locale"
              params={{ locale }}
              search={toSearch(filters)}
              className="t-chip bg-[rgba(18,22,28,.14)] px-[var(--s-4)] py-[var(--s-3)] hover:bg-[rgba(18,22,28,.24)]"
            >
              {t('map.tab')}
            </Link>
            <span aria-current="page" className="t-chip bg-[var(--asphalt-950)] px-[var(--s-4)] py-[var(--s-3)] text-[var(--accent)]">
              {t('list.open')}
            </span>
          </nav>
        </div>
      )}

      <div className={`order-3 mt-[var(--s-5)] flex flex-col gap-[var(--s-3)] ${GUTTER} lg:mt-0 lg:gap-0 lg:px-0`}>
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

        {/* Заголовок таблицы прилипает к верху прокрутки: за двадцатью строками
            колонки перестают читаться. */}
        {desktop && items.length > 0 && (
          <div
            className={`${ROW_COLUMNS} t-label sticky top-0 z-[1] h-[44px] border-b border-[var(--border-2)] bg-[var(--surface-sunken)] text-[var(--text-2)]`}
          >
            <span>{t('list.column.status')}</span>
            <span>{t('list.column.number')}</span>
            <span>{t('list.column.place')}</span>
            <span className="text-center">{t('list.column.photo')}</span>
            <span>{t('list.column.date')}</span>
            <span />
          </div>
        )}

        {/* На телефоне таблицы нет и не будет: восемь колонок на 390 px не живут,
            и макет её не рисует. Там остаются карточки. */}
        <ul className="flex flex-col gap-[var(--s-3)] empty:hidden lg:gap-0">
          {items.map((item) => (
            <li key={item.number}>
              {desktop ? <ReportRow item={item} locale={locale} /> : <ReportCard item={item} locale={locale} />}
            </li>
          ))}
        </ul>

        {/* Пусто по фильтрам. На телефоне то же сообщение лежит поверх карты — там она
            подсказывает, куда сдвинуться, а здесь подсказывать нечем. */}
        {desktop && list.isSuccess && items.length === 0 && (
          <div className="p-[var(--s-6)]">
            <EmptyState title={t('map.empty.title')} hint={t('map.empty.hint')}>
              <button type="button" onClick={() => void navigate({ search: {} })} className={`${SECONDARY} mt-[var(--s-2)] w-auto`}>
                {t('filters.reset')}
              </button>
            </EmptyState>
          </div>
        )}

        {list.hasNextPage && (
          <button
            type="button"
            onClick={() => void list.fetchNextPage()}
            disabled={list.isFetchingNextPage}
            className={`${COMPACT} self-start lg:m-[var(--s-6)]`}
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
