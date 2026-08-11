import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { catalogKeys, fetchDistricts, localizedName } from '../../entities/catalog/api'
import { EMPTY_FILTERS, fetchReportDetail, fetchReportList } from '../../entities/report/api'
import { repairDays } from '../../shared/format/date'
import { formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'
import { PhotoPlate } from '../../shared/ui/media/PhotoPlate'
import { STATS_INTERVAL, useCampaignStats } from './useCampaignStats'

/** Последняя закрытая заявка — та же выборка, что и число «отремонтировано». */
const DONE_ONLY = { ...EMPTY_FILTERS, status: ['DONE' as const] }

/** Ключ свой, не `reportKeys.list`: под тем ключом список страницы копит страницы
 *  `useInfiniteQuery`, и обычный запрос с той же выборкой затёр бы его форму. */
const LATEST_KEY = ['reports', 'latest-done'] as const

/** Что бригада закрыла последним: прибавка за неделю, пара «до / после» и то, где это было
 *  (Desktop C › правая колонка под плакатом).
 *
 *  Пара снимков берётся из карточки заявки, а не из списка: в списке лежит одно превью
 *  без признака «до» или «после», и собрать из него пару нельзя.
 *
 *  Адреса в подписи нет и не будет: геокодера в системе не существует (ADR-0004).
 *  Заголовок — ориентир, который написал житель, а под ним район и срок ремонта.
 *  Номера бригады тоже нет: макет его показывает, контракт — нет. */
export function LatestRepaired() {
  const { locale, t, tp } = useI18n()
  const stats = useCampaignStats()
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })

  const latest = useQuery({
    queryKey: LATEST_KEY,
    queryFn: () => fetchReportList(DONE_ONLY, null),
    staleTime: STATS_INTERVAL,
  })
  const number = latest.data?.items[0]?.number
  const detail = useQuery({
    queryKey: ['reports', 'latest-done', number],
    queryFn: () => fetchReportDetail(number as number),
    enabled: number !== undefined,
    staleTime: STATS_INTERVAL,
  })

  const report = detail.data
  const before = report?.photos.find((photo) => photo.kind === 'BEFORE')
  const after = report?.photos.find((photo) => photo.kind === 'AFTER')
  // Без пары показывать нечего: одна плита «до» рядом с пустотой читается как
  // недогруженная страница, а не как заявка, у которой ещё нет снимка «после».
  const pair = before !== undefined && after !== undefined ? { before, after } : null
  const week = stats.data?.doneLastWeek ?? 0

  if (week === 0 && pair === null) return null

  const district = districts.data?.find((item) => item.code === report?.districtCode)
  const districtName = district === undefined ? null : localizedName(district, locale)

  return (
    <section className="flex flex-col">
      {/* «+0 ta» на плакате кампании читается как поломка, а не как факт: за неделю
          может не закрыться ничего, и тогда строки нет вовсе. */}
      {week > 0 && (
        <p className="flex items-baseline justify-between gap-[var(--s-3)] px-[var(--gutter)] pb-[var(--s-3)]">
          <span className="t-section text-[var(--text-2)]">{t('home.lastWeek')}</span>
          <span className="t-chip text-[var(--status-done-ink)]">
            +<span className="tabular-nums">{formatNumber(week)}</span> {tp('map.reports', week)}
          </span>
        </p>
      )}

      {pair !== null && report !== undefined && (
        <>
          {/* Пара идёт в край и без рамки — та же подача, что на странице заявки. */}
          <div className="grid grid-cols-2 gap-[2px] bg-[var(--border-1)]">
            <PhotoPlate src={pair.before.previewUrl} alt={t('report.photoAlt')} caption={t('report.before')} />
            <PhotoPlate
              src={pair.after.previewUrl}
              alt={t('report.photoAfterAlt')}
              caption={t('report.after')}
              tone="done"
            />
          </div>
          <Link
            to="/$locale/reports/$number"
            params={{ locale, number: String(report.number) }}
            className="flex flex-col gap-[var(--s-1)] px-[var(--gutter)] pt-[var(--s-3)]"
          >
            <span className="t-h3 font-extrabold text-[var(--text-1)]">
              {report.landmark ?? districtName ?? report.displayNumber}
            </span>
            <span className="t-caption text-[var(--text-2)]">
              {[
                report.landmark === null ? null : districtName,
                report.doneAt === null
                  ? null
                  : `${formatNumber(repairDays(report.createdAt, report.doneAt))} ${tp('report.days', repairDays(report.createdAt, report.doneAt))}`,
              ]
                .filter((part) => part !== null)
                .join(' · ')}
            </span>
          </Link>
        </>
      )}
    </section>
  )
}
