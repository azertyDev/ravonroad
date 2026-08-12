import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'
import { catalogKeys, fetchDistricts } from '../../entities/catalog/api'
import type { ReportFilters as Filters } from '../../entities/report/api'
import { MapToolbar } from '../../features/report-filters/MapToolbar'
import { useReportForm } from '../../features/report-form/ReportFormDialog'
import { ReportFilters } from '../../features/report-filters/ReportFilters'
import { toFilters, toSearch, validateReportSearch } from '../../features/report-filters/searchParams'
import { around } from '../../features/report-map/bbox'
import { PublicMap } from '../../features/report-map/PublicMap'
import { CampaignCounter } from '../../features/stats/CampaignCounter'
import { LatestRepaired } from '../../features/stats/LatestRepaired'
import { StatusBreakdown } from '../../features/stats/StatusBreakdown'
import { useI18n } from '../../shared/i18n/useI18n'
import { usePageMeta } from '../../shared/lib/usePageMeta'
import { ActionBar } from '../../shared/ui/control/ActionBar'
import { CTA, GUTTER } from '../../shared/ui/control/styles'

/** Главная в плакатном ключе (Home C): обращение, счётчик кампании во всю ширину,
 *  полоса карты и одно действие внизу.
 *
 *  Ноутбук раскладывает то же самое в две колонки: карта слева на всю высоту,
 *  кампания справа (Desktop C › «Bosh sahifa»). Ни одного блока при этом не появляется
 *  и не исчезает — меняется только порядок, поэтому разметка одна на обе ширины.
 *
 *  Фильтры живут в адресе, как и на списке: набор один на карту и на список, и переход
 *  между ними обязан его сохранять (SRS §7.3). */
export function HomePage() {
  const { locale, t } = useI18n()
  usePageMeta(t('meta.home.title'), t('meta.home.description'))
  const openForm = useReportForm()
  // `strict: false`: экран рисуется и под главной, и под формой, поэтому привязать
  // чтение к одному из двух маршрутов нельзя. Разбор всё равно свой — тот же, что
  // у маршрута, и мусор из адреса он уже отбросил.
  const search = validateReportSearch(useSearch({ strict: false }))
  const navigate = useNavigate()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filters = toFilters(search)
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const district = districts.data?.find((item) => item.code === filters.district)
  // Прицел из адреса важнее района: по нему пришли со страницы заявки, чтобы увидеть
  // именно её, а район в фильтре мог остаться с прошлого просмотра.
  const focus =
    search.lat !== undefined && search.lon !== undefined
      ? around(search.lon, search.lat)
      : (district?.bbox ?? null)
  // Цель указана явно, а не «сюда же»: фильтры меняют и с главной, и из-под формы,
  // а адрес среза всегда один — карта.
  const apply = (next: Filters): void =>
    void navigate({ to: '/$locale', params: { locale }, search: toSearch(next) })

  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[1fr_420px]">
      {/* Карта. На телефоне — полоса под счётчиком, на ноутбуке — левая колонка
          во всю высоту экрана. Порядок задан `order`, а не второй разметкой:
          два дерева разъехались бы на первой же правке.

          Высота обеих колонок приходит от карточки, а не от чисел в классах: карта
          обязана заполнить остаток экрана, а высота шапки зависит от языка. */}
      <div className="order-2 flex flex-col lg:order-1 lg:min-h-0 lg:border-r lg:border-[var(--border-1)]">
        <MapToolbar filters={filters} onChange={apply} onOpen={() => setFiltersOpen(true)} />
        <div className="relative min-h-0 flex-1">
          <PublicMap
            filters={filters}
            focus={focus}
            locate="desktop"
            className="h-[196px] lg:h-full"
          />
          {/* Сегментный переключатель слева внизу карты: где смотреть заявки — на карте
              или списком. Вкладки «Sputnik» нет: спутниковых тайлов у нас не существует,
              экстракт векторный. Срез переезжает вместе с человеком — он выбирал его здесь. */}
          <nav className="absolute bottom-[var(--s-3)] left-[var(--s-3)] flex overflow-hidden rounded-[var(--r-3)] shadow-[var(--e-2)]">
            <span aria-current="page" className="t-chip bg-[var(--surface-card)] px-[var(--s-4)] py-[var(--s-3)] text-[var(--text-1)]">
              {t('map.tab')}
            </span>
            <Link
              to="/$locale/reports"
              params={{ locale }}
              search={toSearch(filters)}
              className="t-chip bg-[rgba(18,22,28,.78)] px-[var(--s-4)] py-[var(--s-3)] text-[#FBFBFD] hover:bg-[rgba(18,22,28,.9)]"
            >
              {t('list.open')}
            </Link>
          </nav>
        </div>
      </div>

      {filtersOpen && <ReportFilters filters={filters} onChange={apply} onClose={() => setFiltersOpen(false)} />}

      {/* Форма заявки. Модальное окно поверх этого же экрана, поэтому она — вложенный
          маршрут, а не соседний: карта под ней остаётся той же самой (Desktop C). */}
      <Outlet />

      {/* Прокручивается правая колонка, а не страница: карта слева при этом остаётся
          на месте целиком (Desktop C). */}
      {/* Верхнего поля на ноутбуке нет: жёлтая плита начинается от той же линии, что
          и полоса фильтров слева, и любой отступ над ней читается как съехавший блок.
          Поле по бокам, наоборот, обязательно: в макете колонка отстояла от кромки
          экрана полем карточки 1440, а карточку мы отменили — без него плита, снимки
          и числа статусов упираются в самый край окна и читаются как обрезанные. */}
      <div className="order-1 flex flex-col gap-[var(--block-gap)] py-[var(--s-4)] lg:order-2 lg:min-h-0 lg:gap-[var(--s-5)] lg:overflow-auto lg:px-[var(--s-6)] lg:pt-[var(--s-4)] lg:pb-[var(--s-4)]">
        {/* Заголовок разбит на две строки блочными span'ами, а не жёстким <br>: перенос
            в макете расставлен под 390 px и под узбекский, а русская строка короче.

            На ноутбуке он уходит из вида, но не из страницы: обращение и обещание бригады
            стоят в шапке слоганом, а плакат начинается сразу со счётчика (Desktop C).
            Заголовок первого уровня при этом обязан остаться — страница без него
            читается скринридером как безымянная. */}
        <div className={`flex flex-col gap-[var(--s-3)] ${GUTTER} lg:sr-only`}>
          <h1 className="t-display uppercase">
            <span className="block">{t('home.titleAction')}</span>
            {/* Обещание бригады выделено подложкой на светлой теме и цветом на тёмной:
                токен несёт оба варианта, поэтому строка здесь одна. `box-decoration-break`
                нужен для узбекского — он длиннее и переносится на две строки, а подложка
                обязана обнять обе. */}
            <span className="box-decoration-clone inline bg-[var(--hero-accent-bg)] px-[var(--hero-accent-pad)] text-[var(--hero-accent-ink)]">
              {t('home.titlePromise')}
            </span>
          </h1>
          <p className="t-body text-[var(--text-2)]">{t('home.lead')}</p>
        </div>

        <CampaignCounter />
        <LatestRepaired />
        <StatusBreakdown />
      </div>

      {/* На ноутбуке действие стоит в шапке и второй раз внизу не нужно: в макете
          подвал занимает строка о волонтёрах, а не кнопка (Desktop C). */}
      <ActionBar caption={t('home.ctaCaption')} className="order-3 lg:hidden">
        <button type="button" onClick={openForm} className={CTA}>
          {t('home.cta')}
        </button>
      </ActionBar>
    </div>
  )
}
