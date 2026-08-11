import { PUBLIC_STATUSES } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import { catalogKeys, fetchDistricts, localizedName } from '../../entities/catalog/api'
import type { ReportFilters as Filters } from '../../entities/report/api'
import { useCampaignStats } from '../stats/useCampaignStats'
import { formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'
import { COMPACT_ACCENT } from '../../shared/ui/control/styles'
import { ToggleChip } from '../../shared/ui/control/ToggleChip'
import { Glyph } from '../../shared/ui/icon/Glyph'
import { countFilters } from './searchParams'

interface MapToolbarProps {
  filters: Filters
  onChange: (filters: Filters) => void
  /** Остальные фильтры — район, тип, даты — живут в листе: в строку они не помещаются
   *  и на телефоне отжали бы карту за нижний край. */
  onOpen: () => void
}

/** Строка над картой: вход в фильтры, статусы со счётчиками и срез, который сейчас виден
 *  (Desktop C › «Bosh sahifa»).
 *
 *  Статус — плашка-переключатель, а не подпись легенды: число рядом со словом само
 *  просится, чтобы по нему нажали, и нажатие обязано что-то делать. Все публичные статусы
 *  стоят всегда, включая пустые: пропавшая плашка читается как «такого не бывает».
 *
 *  Справа — сколько заявок в срезе. Без выбранного района это весь город: пустое место
 *  на том же краю строки читалось бы как не приехавшее число. */
export function MapToolbar({ filters, onChange, onOpen }: MapToolbarProps) {
  const { locale, t, tp } = useI18n()
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const stats = useCampaignStats()
  const active = countFilters(filters)
  const district = districts.data?.find((item) => item.code === filters.district)

  // Число по району — из разбивки, а не из точек карты: точки ограничены видимой
  // областью и обрезаны потолком выдачи, а здесь нужно «сколько всего».
  const scope =
    stats.data === undefined
      ? null
      : district === undefined
        ? { name: t('map.wholeCity'), count: Object.values(stats.data.byDistrict).reduce((sum, n) => sum + n, 0) }
        : { name: localizedName(district, locale), count: stats.data.byDistrict[district.code] ?? 0 }

  return (
    <div className="flex flex-wrap items-center gap-[var(--s-2)] border-b border-[var(--border-1)] px-[var(--gutter)] py-[var(--s-3)] lg:px-[var(--s-6)]">
      <button type="button" onClick={onOpen} className={COMPACT_ACCENT}>
        <Glyph name="filter" size={14} />
        {t('filters.open')}
        {active > 0 && (
          <span className="t-label grid h-[20px] min-w-[20px] place-items-center rounded-[var(--r-1)] bg-[var(--asphalt-950)] px-[var(--s-1)] text-[var(--signal-500)] tabular-nums">
            {formatNumber(active)}
          </span>
        )}
      </button>

      {PUBLIC_STATUSES.map((status) => (
        <ToggleChip
          key={status}
          type="checkbox"
          status={status}
          checked={filters.status.includes(status)}
          count={stats.data?.byStatus[status]}
          onChange={(checked) =>
            onChange({
              ...filters,
              status: checked
                ? [...filters.status, status]
                : filters.status.filter((value) => value !== status),
            })
          }
        >
          {t(`status.${status}`)}
        </ToggleChip>
      ))}

      {scope !== null && (
        <p className="t-chip ml-auto text-[var(--text-2)]">
          {scope.name} · <span className="tabular-nums">{formatNumber(scope.count)}</span> {tp('map.reports', scope.count)}
        </p>
      )}
    </div>
  )
}
