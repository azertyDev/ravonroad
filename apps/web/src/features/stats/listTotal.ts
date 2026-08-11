import { isPublicStatus, type StatsResponse } from '@ravonroad/shared-types'
import type { ReportFilters } from '../../entities/report/api'

/** Сколько заявок в срезе — число на жёлтой полосе списка (Desktop C › экран 1b).
 *
 *  `ReportListResponse.total` всегда `null`: `COUNT(*)` по фильтру стоит полного скана
 *  (SRS §4.3). Разбивка из `/api/stats` отвечает на тот же вопрос, но только когда срез
 *  ложится на одну её ось. Пересечения «статус И район» разбивка не знает, и перемножать
 *  оси значило бы напечатать выдуманное число на публичном сайте кампании.
 *
 *  Поэтому здесь `null` во всех неоднозначных случаях, а список пишет «показано N»
 *  по загруженным строкам: это правда всегда. */
export function listTotal(filters: ReportFilters, stats: StatsResponse | undefined): number | null {
  if (stats === undefined) return null
  // Категория и даты в разбивке не представлены вовсе.
  if (filters.category !== null || filters.from !== null || filters.to !== null) return null

  const hasStatus = filters.status.length > 0
  if (filters.district !== null) return hasStatus ? null : (stats.byDistrict[filters.district] ?? 0)
  if (!hasStatus) return null
  return filters.status.filter(isPublicStatus).reduce((sum, status) => sum + stats.byStatus[status], 0)
}
