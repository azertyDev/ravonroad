import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { EMPTY_FILTERS, fetchReportMap, reportKeys } from '../../entities/report/api'
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

/** Публичная карта заявок: точки, кластеры, выбор заявки и своя геопозиция.
 *
 *  Область экрана огрубляется до сетки и становится частью ключа запроса, а не поводом
 *  сбросить кэш: вернувшись к прежней области, житель видит её точки мгновенно и без
 *  запроса (SRS §7.5). */
export function PublicMap() {
  const { t } = useI18n()
  const [bbox, setBbox] = useState(CITY_BBOX)
  const [selected, setSelected] = useState<number | null>(null)
  const [focus, setFocus] = useState<Bounds | null>(null)
  const archiveUrl = import.meta.env.VITE_MAP_PMTILES_URL

  const map = useQuery({
    queryKey: reportKeys.map(bbox, EMPTY_FILTERS),
    queryFn: () => fetchReportMap(bbox, EMPTY_FILTERS),
    staleTime: MAP_STALE_TIME,
    // Пока едет ответ по новой области, на карте остаются точки прежней: иначе карта
    // мигала бы пустотой на каждый жест.
    placeholderData: keepPreviousData,
  })

  const hasArchive = archiveUrl !== undefined && archiveUrl !== ''

  return (
    <section
      aria-label={t('map.title')}
      className="relative h-[60vh] min-h-[320px] w-full overflow-hidden rounded-[var(--r-3)] border border-[var(--border-1)] bg-[var(--surface-sunken)]"
    >
      {hasArchive ? (
        <Suspense fallback={null}>
          <ReportMap
            archiveUrl={archiveUrl}
            points={map.data?.points ?? []}
            statuses={map.data?.statuses ?? []}
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

      {hasArchive && (
        <div className="absolute bottom-[var(--s-3)] left-[var(--s-3)]">
          <LocateButton onLocated={setFocus} />
        </div>
      )}

      {selected !== null && <ReportPopup number={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
