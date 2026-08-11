import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { ReportMapResponse } from '@ravonroad/shared-types'
import { EMPTY_FILTERS, fetchReportMap, reportKeys, type ReportFilters } from '../../entities/report/api'
import { apiErrorCode } from '../../shared/api/client'
import { useI18n } from '../../shared/i18n/useI18n'
import type { Bounds } from '../../shared/map/tashkent'
import { ErrorState } from '../../shared/ui/state/ErrorState'
import { CITY_BBOX, quantizeBbox } from './bbox'
import { LocateButton } from './LocateButton'
import { ReportPopup } from './ReportPopup'

/** MapLibre и стиль подложки грузятся только здесь и в форме, динамическим `import()`:
 *  на `/z/<token>` их вес не попадает (SRS §7.4). */
const ReportMap = lazy(() => import('./ReportMap'))

/** Пан и зум не должны бить в API на каждый кадр (SRS §7.5). */
const MAP_STALE_TIME = 30_000

/** Пустые значения — модульные константы, а не литералы в разметке.
 *
 *  Литерал `?? []` создаёт новый массив на каждый рендер, эффект карты видит новые
 *  зависимости, зовёт `setData`, тот поднимает `sourcedata`, пересчёт маркеров вызывает
 *  `setState` — и рендер начинается заново. Цикл занимает главный поток, MapLibre
 *  не получает кадра, и карта не доходит до события `load`: тайлы не грузятся,
 *  маркеров нет, в консоли пусто. */
const NO_POINTS: ReportMapResponse['points'] = []
const NO_STATUSES: ReportMapResponse['statuses'] = []

/** Публичная карта заявок: точки, кластеры, выбор заявки и своя геопозиция.
 *
 *  Область экрана огрубляется до сетки и становится частью ключа запроса, а не поводом
 *  сбросить кэш: вернувшись к прежней области, житель видит её точки мгновенно и без
 *  запроса (SRS §7.5). */
interface PublicMapProps {
  /** Один и тот же фильтр обязан давать один и тот же набор в списке и на карте (US-003). */
  filters?: ReportFilters
  /** Куда подогнать границы снаружи: выбранный район (US-031). */
  focus?: Bounds | null
  /** Размер и кромка задаются снаружи: на главной карта — полоса во всю ширину экрана,
   *  в списке — рабочее поле в рамке, на ноутбуке — колонка во всю высоту. */
  className?: string
  /** «Моё местоположение». На полосе главной его нет: на 196 пикселях высоты ехать
   *  некуда, а кнопка там занимает четверть карты и наезжает на вход в список. */
  locate?: boolean
}

const DEFAULT_SHAPE = 'h-[60vh] min-h-[320px] rounded-[var(--r-3)] border border-[var(--border-1)]'

export function PublicMap({
  filters = EMPTY_FILTERS,
  focus: requested = null,
  className = DEFAULT_SHAPE,
  locate = true,
}: PublicMapProps = {}) {
  const { t } = useI18n()
  const [bbox, setBbox] = useState(CITY_BBOX)
  const [selected, setSelected] = useState<number | null>(null)
  const [focus, setFocus] = useState<Bounds | null>(requested)

  // Район из фильтра и кнопка «моё местоположение» двигают карту одним и тем же способом.
  useEffect(() => {
    if (requested !== null) setFocus(requested)
  }, [requested])
  const archiveUrl = import.meta.env.VITE_MAP_PMTILES_URL

  const map = useQuery({
    queryKey: reportKeys.map(bbox, filters),
    queryFn: () => fetchReportMap(bbox, filters),
    staleTime: MAP_STALE_TIME,
    // Пока едет ответ по новой области, на карте остаются точки прежней: иначе карта
    // мигала бы пустотой на каждый жест.
    placeholderData: keepPreviousData,
  })

  const hasArchive = archiveUrl !== undefined && archiveUrl !== ''

  return (
    <section
      aria-label={t('map.title')}
      className={`relative w-full overflow-hidden bg-[var(--surface-sunken)] ${className}`}
    >
      {hasArchive ? (
        <Suspense fallback={null}>
          <ReportMap
            archiveUrl={archiveUrl}
            points={map.data?.points ?? NO_POINTS}
            statuses={map.data?.statuses ?? NO_STATUSES}
            selected={selected}
            onSelect={setSelected}
            onBoundsChange={(bounds) => setBbox(quantizeBbox(bounds))}
            focus={focus}
          />
        </Suspense>
      ) : (
        // Адрес экстракта не задан при сборке — карты не будет, и делать вид, что она
        // грузится, нельзя: список заявок работает и без неё (PRD §8.2).
        <p className="t-body-l grid h-full place-items-center p-[var(--gutter)] text-center text-[var(--text-2)]">
          {t('map.unavailable')}
        </p>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-[var(--s-2)] p-[var(--s-3)]">
        {map.isError && (
          <div className="pointer-events-auto rounded-[var(--r-2)] bg-[var(--surface-card)] p-[var(--s-3)] shadow-[var(--e-2)]">
            {/* Без сети — «нет связи», а не «что-то пошло не так»: белый экран и общая
                ошибка одинаково бесполезны стоящему у ямы (PRD §8.4). */}
            {navigator.onLine ? (
              <ErrorState code={apiErrorCode(map.error)} onRetry={() => void map.refetch()} />
            ) : (
              <p role="alert" className="t-body-l">
                {t('map.offline')}
              </p>
            )}
          </div>
        )}

        {map.data?.truncated === true && (
          <p
            role="status"
            className="t-caption pointer-events-auto rounded-[var(--r-2)] bg-[var(--surface-card)] px-[var(--s-3)] py-[var(--s-2)] shadow-[var(--e-2)]"
          >
            {t('map.truncated')}
          </p>
        )}
      </div>

      {hasArchive && locate && (
        <div className="absolute bottom-[var(--s-3)] left-[var(--s-3)]">
          <LocateButton onLocated={setFocus} />
        </div>
      )}

      {selected !== null && <ReportPopup number={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
