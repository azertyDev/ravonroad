import { PUBLIC_STATUSES } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import { catalogKeys, fetchCategories, fetchDistricts, localizedName } from '../../entities/catalog/api'
import { EMPTY_FILTERS, type ReportFilters as Filters } from '../../entities/report/api'
import { useI18n } from '../../shared/i18n/useI18n'
import { isEmptyFilters } from './searchParams'

const FIELD =
  'min-h-[var(--touch-base)] rounded-[var(--r-2)] border border-[var(--border-2)] bg-[var(--surface-card)] px-[var(--s-3)]'

interface ReportFiltersProps {
  filters: Filters
  onChange: (filters: Filters) => void
}

/** Фильтры списка и карты (US-003, US-031, US-033).
 *
 *  Поля нативные: `<select>` и `<input type="date">` на телефоне открывают системный
 *  выбор, который житель уже умеет, и не стоят ни килобайта бандла. Статусы —
 *  флажки, а не мультиселект: мультиселект на телефоне требует удержания и промахивается. */
export function ReportFilters({ filters, onChange }: ReportFiltersProps) {
  const { locale, t } = useI18n()
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: Infinity })

  return (
    <section className="flex flex-col gap-[var(--s-4)]">
      <fieldset className="flex flex-col gap-[var(--s-2)] border-0 p-0">
        <legend className="t-label mb-[var(--s-2)]">{t('filters.status')}</legend>
        <div className="flex flex-wrap gap-[var(--s-3)]">
          {PUBLIC_STATUSES.map((status) => (
            <label key={status} className="t-caption inline-flex min-h-[var(--touch-min)] items-center gap-[var(--s-2)]">
              <input
                type="checkbox"
                checked={filters.status.includes(status)}
                onChange={(event) =>
                  onChange({
                    ...filters,
                    status: event.target.checked
                      ? [...filters.status, status]
                      : filters.status.filter((value) => value !== status),
                  })
                }
              />
              {t(`status.${status}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-[var(--s-3)]">
        <label className="flex flex-1 flex-col gap-[var(--s-1)]">
          <span className="t-caption text-[var(--text-2)]">{t('filters.district')}</span>
          <select
            className={FIELD}
            value={filters.district ?? ''}
            onChange={(event) => onChange({ ...filters, district: event.target.value === '' ? null : event.target.value })}
          >
            <option value="">{t('filters.any')}</option>
            {(districts.data ?? []).map((district) => (
              <option key={district.code} value={district.code}>
                {localizedName(district, locale)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-[var(--s-1)]">
          <span className="t-caption text-[var(--text-2)]">{t('filters.category')}</span>
          <select
            className={FIELD}
            value={filters.category ?? ''}
            onChange={(event) => onChange({ ...filters, category: event.target.value === '' ? null : event.target.value })}
          >
            <option value="">{t('filters.any')}</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.code} value={category.code}>
                {localizedName(category, locale)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-[var(--s-3)]">
        <label className="flex flex-col gap-[var(--s-1)]">
          <span className="t-caption text-[var(--text-2)]">{t('filters.from')}</span>
          <input
            type="date"
            className={FIELD}
            value={filters.from ?? ''}
            onChange={(event) => onChange({ ...filters, from: event.target.value === '' ? null : event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-[var(--s-1)]">
          <span className="t-caption text-[var(--text-2)]">{t('filters.to')}</span>
          <input
            type="date"
            className={FIELD}
            value={filters.to ?? ''}
            onChange={(event) => onChange({ ...filters, to: event.target.value === '' ? null : event.target.value })}
          />
        </label>
        <label className="t-caption inline-flex min-h-[var(--touch-base)] items-center gap-[var(--s-2)]">
          <input
            type="checkbox"
            checked={filters.dateField === 'done'}
            onChange={(event) => onChange({ ...filters, dateField: event.target.checked ? 'done' : 'created' })}
          />
          {t('filters.doneDates')}
        </label>
      </div>

      {!isEmptyFilters(filters) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="t-label inline-flex min-h-[var(--touch-base)] items-center self-start rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
        >
          {t('filters.reset')}
        </button>
      )}
    </section>
  )
}
