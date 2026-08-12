import { CAMPAIGN_GOAL, type StatsResponse } from '@ravonroad/shared-types'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiFetch } from '../../shared/api/client'

/** PRD требует показать переход в `DONE` за ≤ 60 с. Тридцать даёт запас и совпадает
 *  с TTL обоих рубежей кэша: чаще спрашивать нечего — до `api` запрос всё равно
 *  не дойдёт (SRS §4.7, §7.5). */
export const STATS_INTERVAL = 30_000

/** Число кампании читают два места: счётчик на главной и полоса «одна из 10 000»
 *  на закрытой заявке. Ключ и период у них обязаны совпадать — иначе на двух экранах
 *  одного сеанса стоят два разных числа, и это читается как ошибка, а не как задержка. */
export function useCampaignStats(): UseQueryResult<StatsResponse> {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => apiFetch<StatsResponse>('/stats'),
    staleTime: STATS_INTERVAL,
    refetchInterval: STATS_INTERVAL,
  })
}

export { CAMPAIGN_GOAL }
