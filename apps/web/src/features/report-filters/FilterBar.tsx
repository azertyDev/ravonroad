import { useQuery } from '@tanstack/react-query'
import { catalogKeys, fetchCategories, fetchDistricts, localizedName } from '../../entities/catalog/api'
import type { ReportFilters as Filters } from '../../entities/report/api'
import { formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'
import { COMPACT, COMPACT_ACCENT } from '../../shared/ui/control/styles'
import { Glyph } from '../../shared/ui/icon/Glyph'

interface FilterBarProps {
  filters: Filters
  onChange: (filters: Filters) => void
  onOpen: () => void
}

/** Строка фильтров над картой: вход в лист и то, что уже выбрано.
 *
 *  Каждый выбранный фильтр стоит отдельной плашкой и снимается одним касанием, не
 *  открывая лист: чаще всего человеку нужно снять один из четырёх, а не пересобрать
 *  набор. Число рядом с «Фильтрами» говорит, сколько их всего, — иначе за пределами
 *  экрана остаётся неизвестно что.
 *
 *  Даты показаны как есть, без склейки в период: «с 1 августа» и «по 7 августа» —
 *  два независимых фильтра, и снимать их тоже нужно порознь. */
export function FilterBar({ filters, onChange, onOpen }: FilterBarProps) {
  const { locale, t } = useI18n()
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: Infinity })

  const district = districts.data?.find((item) => item.code === filters.district)
  const category = categories.data?.find((item) => item.code === filters.category)

  const chips: { key: string; label: string; clear: Filters }[] = [
    ...filters.status.map((status) => ({
      key: `status-${status}`,
      label: t(`status.${status}`),
      clear: { ...filters, status: filters.status.filter((value) => value !== status) },
    })),
    ...(category === undefined
      ? []
      : [{ key: 'category', label: localizedName(category, locale), clear: { ...filters, category: null } }]),
    ...(district === undefined
      ? []
      : [{ key: 'district', label: localizedName(district, locale), clear: { ...filters, district: null } }]),
    ...(filters.from === null ? [] : [{ key: 'from', label: filters.from, clear: { ...filters, from: null } }]),
    ...(filters.to === null ? [] : [{ key: 'to', label: filters.to, clear: { ...filters, to: null } }]),
  ]

  return (
    <div className="flex flex-wrap items-center gap-[var(--s-2)]">
      <button type="button" onClick={onOpen} className={COMPACT_ACCENT}>
        <Glyph name="filter" size={14} />
        {t('filters.open')}
        {chips.length > 0 && (
          <span className="t-label grid h-[20px] min-w-[20px] place-items-center rounded-[var(--r-1)] bg-[var(--asphalt-950)] px-[var(--s-1)] text-[var(--signal-500)] tabular-nums">
            {formatNumber(chips.length)}
          </span>
        )}
      </button>

      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChange(chip.clear)}
          // Подпись фильтра плюс слово «сбросить»: одного крестика рядом со словом
          // мало — вслух он читается как часть названия фильтра, а не как действие.
          aria-label={`${chip.label} — ${t('filters.reset')}`}
          className={COMPACT}
        >
          <span className="tabular-nums">{chip.label}</span>
          <Glyph name="close" size={12} />
        </button>
      ))}
    </div>
  )
}
