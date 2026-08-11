import { PUBLIC_STATUSES } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import { catalogKeys, fetchCategories, fetchDistricts, localizedName } from '../../entities/catalog/api'
import { EMPTY_FILTERS, type ReportFilters as Filters } from '../../entities/report/api'
import { formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'
import { CTA, FIELD, SECONDARY } from '../../shared/ui/control/styles'
import { Sheet } from '../../shared/ui/control/Sheet'
import { ToggleChip } from '../../shared/ui/control/ToggleChip'
import { isEmptyFilters } from './searchParams'

interface ReportFiltersProps {
  filters: Filters
  onChange: (filters: Filters) => void
  onClose: () => void
  /** Сколько заявок в срезе прямо сейчас. Фильтр применяется сразу, поэтому число
   *  на кнопке — это результат, а не прогноз: человек видит его до того, как закроет
   *  лист, и не жмёт вслепую. */
  count?: number
}

/** Фильтры списка и карты (US-003, US-031, US-033) в нижнем листе.
 *
 *  Статусы и категории — плашки-переключатели: на телефоне попасть по плашке 44 px
 *  проще, чем по флажку 20 px, а внутри всё те же `checkbox` и `radio`, поэтому
 *  клавиатура и скринридер работают без единого атрибута с нашей стороны.
 *
 *  Район и даты остались нативными: `<select>` и `<input type="date">` открывают
 *  системный выбор, который житель уже умеет, и не стоят ни килобайта бандла.
 *
 *  Изменение применяется сразу и уходит в адрес: ссылку на срез можно переслать
 *  в группу, а «назад» возвращает предыдущий набор (SRS §7.3). Кнопки «применить»
 *  поэтому нет — есть «показать», и она просто закрывает лист. */
export function ReportFilters({ filters, onChange, onClose, count }: ReportFiltersProps) {
  const { locale, t } = useI18n()
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: Infinity })

  return (
    <Sheet
      title={t('filters.open')}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={CTA}>
            {t('filters.show')}
            {count !== undefined && <span className="tabular-nums">· {formatNumber(count)}</span>}
          </button>
          {!isEmptyFilters(filters) && (
            <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className={SECONDARY}>
              {t('filters.reset')}
            </button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-[var(--block-gap)]">
        <fieldset className="flex flex-col gap-[var(--s-3)] border-0 p-0">
          <legend className="t-section mb-[var(--s-2)] text-[var(--text-2)]">{t('filters.status')}</legend>
          <div className="flex flex-wrap gap-[var(--s-2)]">
            {PUBLIC_STATUSES.map((status) => (
              <ToggleChip
                key={status}
                type="checkbox"
                status={status}
                checked={filters.status.includes(status)}
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
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-[var(--s-3)] border-0 p-0">
          <legend className="t-section mb-[var(--s-2)] text-[var(--text-2)]">{t('filters.category')}</legend>
          <div className="flex flex-wrap gap-[var(--s-2)]">
            {(categories.data ?? []).map((category) => (
              <ToggleChip
                key={category.code}
                type="checkbox"
                // Категория одна, но снять её обязано то же касание, что поставило:
                // radio снимается только выбором другого, и «любая» стала бы
                // отдельной плашкой ради того, что checkbox умеет сам.
                checked={filters.category === category.code}
                onChange={(checked) => onChange({ ...filters, category: checked ? category.code : null })}
              >
                {localizedName(category, locale)}
              </ToggleChip>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-[var(--s-2)]">
          <span className="t-section text-[var(--text-2)]">{t('filters.district')}</span>
          <select
            className={FIELD}
            value={filters.district ?? ''}
            onChange={(event) =>
              onChange({ ...filters, district: event.target.value === '' ? null : event.target.value })
            }
          >
            <option value="">{t('filters.any')}</option>
            {(districts.data ?? []).map((district) => (
              <option key={district.code} value={district.code}>
                {localizedName(district, locale)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-[var(--s-3)]">
          <p className="t-section text-[var(--text-2)]">{t('filters.from')}</p>
          <div className="grid grid-cols-2 gap-[var(--s-2)]">
            <label className="flex flex-col gap-[var(--s-1)]">
              <span className="t-caption text-[var(--text-2)]">{t('filters.from')}</span>
              <input
                type="date"
                className={`${FIELD} tabular-nums`}
                value={filters.from ?? ''}
                onChange={(event) =>
                  onChange({ ...filters, from: event.target.value === '' ? null : event.target.value })
                }
              />
            </label>
            <label className="flex flex-col gap-[var(--s-1)]">
              <span className="t-caption text-[var(--text-2)]">{t('filters.to')}</span>
              <input
                type="date"
                className={`${FIELD} tabular-nums`}
                value={filters.to ?? ''}
                onChange={(event) => onChange({ ...filters, to: event.target.value === '' ? null : event.target.value })}
              />
            </label>
          </div>
          <label className="t-caption inline-flex min-h-[var(--touch-base)] items-center gap-[var(--s-2)]">
            <input
              type="checkbox"
              checked={filters.dateField === 'done'}
              onChange={(event) => onChange({ ...filters, dateField: event.target.checked ? 'done' : 'created' })}
            />
            {t('filters.doneDates')}
          </label>
        </div>
      </div>
    </Sheet>
  )
}
