import type { ReportListItem } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { catalogKeys, fetchCategories, fetchDistricts, localizedName } from '../catalog/api'
import { formatDate, repairDays } from '../../shared/format/date'
import { formatNumber } from '../../shared/format/number'
import type { Locale } from '../../shared/i18n/locale'
import { useI18n } from '../../shared/i18n/useI18n'
import { StatusChip } from '../../shared/ui/status/StatusChip'

/** Колонки таблицы. Одна строка на заголовок и на ряд: разъехавшись, они читаются
 *  как сбитая вёрстка, а не как таблица. */
export const ROW_COLUMNS = 'grid grid-cols-[200px_96px_1fr_52px_124px_40px] items-center gap-[var(--s-4)] px-[var(--s-6)]'

/** Строка таблицы заявок (Desktop C › экран 1b).
 *
 *  Колонок в макете восемь, здесь шесть: «Ovoz» и «Brigada» выкинуты — ни голосования,
 *  ни бригад в системе нет, — а «Muddat» стал датой: плановых сроков контракт не знает.
 *  Причины записаны в CLAUDE.md › Дизайн.
 *
 *  Строка — ссылка целиком, а не «подробнее» в последней колонке: цель одна, и попадать
 *  в неё нужно любым местом. Шеврон остаётся, он говорит, что строка ведёт дальше. */
export function ReportRow({ item, locale }: { item: ReportListItem; locale: Locale }) {
  const { t, tp } = useI18n()
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: Infinity })

  const district = districts.data?.find((entry) => entry.code === item.districtCode)
  const category = categories.data?.find((entry) => entry.code === item.categoryCode)
  // Закрытая заявка меряется сроком ремонта, открытая — возрастом: «за 4 дня» и
  // «4 дня назад» отвечают на разные вопросы, и складывать их в одну подпись нельзя.
  const days =
    item.doneAt === null
      ? { count: repairDays(item.createdAt, new Date().toISOString()), key: 'list.ago' as const }
      : { count: repairDays(item.createdAt, item.doneAt), key: 'report.days' as const }

  const meta = [
    district === undefined ? null : localizedName(district, locale),
    `${formatNumber(days.count)} ${tp(days.key, days.count)}`,
    category === undefined ? null : localizedName(category, locale),
  ].filter((part) => part !== null)

  return (
    <Link
      to="/$locale/reports/$number"
      params={{ locale, number: String(item.number) }}
      className={`${ROW_COLUMNS} min-h-[66px] border-b border-[var(--border-1)] hover:bg-[var(--surface-sunken)]`}
    >
      <StatusChip status={item.status} />

      <span className="t-body font-bold tabular-nums text-[var(--text-2)]">{item.displayNumber}</span>

      <span className="min-w-0">
        {/* Ориентир обрезается в одну строку: перенос разъехал бы ряды по высоте,
            а таблицу читают по вертикали. */}
        <span className="t-h3 block truncate font-extrabold text-[var(--text-1)]">
          {item.landmark ?? item.displayNumber}
        </span>
        <span className="t-caption mt-[2px] block truncate text-[var(--text-2)]">{meta.join(' · ')}</span>
      </span>

      {/* Фото в очереди обработки — та же полосатая плита, что и полное отсутствие
          снимка: заявка принята целиком, а разницу между «ещё нет» и «не будет»
          в 44 пикселях не показать (SRS §4.2). */}
      <span className="relative h-[44px] w-[44px] justify-self-center">
        {item.previewUrl === null ? (
          <span className="block h-full w-full rounded-[var(--r-2)] bg-[image:var(--hatch-placeholder)]" />
        ) : (
          <img
            src={item.previewUrl}
            alt={t('report.photoAlt')}
            loading="lazy"
            className="h-full w-full rounded-[var(--r-2)] object-cover"
          />
        )}
        {item.photoCount > 0 && (
          <span className="t-label absolute -right-[3px] -bottom-[3px] min-w-[18px] rounded-[var(--r-1)] bg-[var(--text-1)] px-[3px] text-center text-[var(--surface-page)] tabular-nums">
            {formatNumber(item.photoCount)}
          </span>
        )}
      </span>

      {/* Плановой даты в системе нет, поэтому колонка печатает случившееся:
          дату ремонта у закрытой заявки и дату подачи у остальных. */}
      <span className="t-caption tabular-nums text-[var(--text-2)]">
        {formatDate(item.doneAt ?? item.createdAt)}
      </span>

      <span
        aria-hidden="true"
        className="h-[9px] w-[9px] justify-self-end rotate-45 border-t-[2.5px] border-r-[2.5px] border-[var(--border-2)]"
      />
    </Link>
  )
}
