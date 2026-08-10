import { CAMPAIGN_GOAL, type StatsResponse } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../../shared/api/client'
import { formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'

/** PRD требует показать переход в `DONE` за ≤ 60 с. Тридцать даёт запас и совпадает
 *  с TTL обоих рубежей кэша: чаще спрашивать нечего — до `api` запрос всё равно
 *  не дойдёт (SRS §4.7, §7.5). */
const STATS_INTERVAL = 30_000

/** Счётчик кампании (US-005). Число берётся из данных и не хранится отдельно —
 *  рассинхронизировать нечего (PRD 5.3.2). */
export function CampaignCounter() {
  const { t } = useI18n()
  const stats = useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetch<StatsResponse>('/stats'),
    staleTime: STATS_INTERVAL,
    refetchInterval: STATS_INTERVAL,
  })

  return (
    // В DOM подпись идёт перед значением — иначе <dl> не связывает пару, и скринридер
    // объявляет число без имени. Число над подписью возвращает flex-col-reverse:
    // это порядок показа, а не чтения.
    <dl className="flex flex-wrap gap-[var(--s-8)]">
      <div className="flex flex-col-reverse gap-[var(--s-1)]">
        <dt className="t-label text-[var(--text-2)]">{t('home.repairedLabel')}</dt>
        {/* aria-live: счётчик обновляется сам, и молча меняющееся число
            пользователь скринридера не заметит. */}
        <dd className="t-counter" aria-live="polite">
          {stats.data === undefined ? '—' : formatNumber(stats.data.done)}
        </dd>
      </div>
      <div className="flex flex-col-reverse gap-[var(--s-1)]">
        <dt className="t-label text-[var(--text-2)]">{t('home.goalLabel')}</dt>
        <dd className="t-counter">{formatNumber(stats.data?.goal ?? CAMPAIGN_GOAL)}</dd>
      </div>
    </dl>
  )
}
