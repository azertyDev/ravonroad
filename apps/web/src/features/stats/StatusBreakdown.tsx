import { PUBLIC_STATUSES } from '@ravonroad/shared-types'
import { Link } from '@tanstack/react-router'
import { EMPTY_FILTERS } from '../../entities/report/api'
import { toSearch } from '../report-filters/searchParams'
import { formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'
import { StatusMark } from '../../shared/ui/status/StatusMark'
import { STATUS_SLUG } from '../../shared/ui/status/statusShape'
import { useCampaignStats } from './useCampaignStats'

/** «Holatlar»: сколько заявок в каждом публичном статусе.
 *
 *  Строка — ссылка на список с этим фильтром: число само по себе никуда не ведёт,
 *  а прочитав «186 новых», человек хочет их увидеть.
 *
 *  Ноль рисуется числом, а не прячет строку: пропавший статус читается как «такого
 *  не бывает», хотя он просто пуст сегодня. */
export function StatusBreakdown() {
  const { locale, t } = useI18n()
  const stats = useCampaignStats()
  if (stats.data === undefined) return null

  return (
    <section className="flex flex-col gap-[var(--s-4)] px-[var(--gutter)] lg:px-0">
      <h2 className="t-section text-[var(--text-2)]">{t('home.statuses')}</h2>
      <ul className="flex flex-col gap-[var(--s-3)]">
        {PUBLIC_STATUSES.map((status) => (
          <li key={status}>
            <Link
              to="/$locale/reports"
              params={{ locale }}
              search={toSearch({ ...EMPTY_FILTERS, status: [status] })}
              className="flex items-center gap-[var(--s-3)] py-[var(--s-1)]"
              style={{ color: `var(--status-${STATUS_SLUG[status]}-ink)` }}
            >
              <StatusMark status={status} size={13} />
              <span className="t-body font-semibold text-[var(--text-1)]">{t(`status.${status}`)}</span>
              {/* Линия между подписью и числом: без неё глаз не связывает их через
                  четыреста пикселей пустоты. */}
              <span aria-hidden="true" className="h-px flex-1 bg-[var(--border-1)]" />
              <span className="t-body font-bold tabular-nums">{formatNumber(stats.data.byStatus[status])}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
