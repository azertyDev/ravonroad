import type { FilterableReport } from '../reports/filters'

/** «За неделю» — семь суток назад от момента снимка, а не «с понедельника»: неделя
 *  кампании не привязана к календарю, и в понедельник утром цифра не должна обнуляться. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface CampaignSummary {
  done: number
  doneLastWeek: number
  queued: number
  districts: number
}

/** Числа плаката на главной. Считаются одним проходом по тому же снимку, из которого
 *  берутся точки карты: отдельных запросов в БД у счётчика нет вовсе (SRS §4.7).
 *
 *  Ни одно из этих чисел не хранится в БД: хранимый счётчик рано или поздно
 *  рассинхронизируется с заявками, и «отремонтировано» перестанет быть правдой
 *  (инвариант PRD 5.3.2).
 *
 *  `queued` — это `NEW`, то есть заявки, которых ещё не касался модератор. `ACCEPTED`
 *  и `IN_PROGRESS` уже разобраны и в очереди не стоят. */
export function summarize(rows: readonly FilterableReport[], now: number): CampaignSummary {
  const since = now - WEEK_MS
  const districts = new Set<string>()
  let done = 0
  let doneLastWeek = 0
  let queued = 0

  for (const row of rows) {
    districts.add(row.districtCode)
    if (row.status === 'NEW') queued += 1
    if (row.status !== 'DONE') continue
    done += 1
    // `doneAt` пуст у заявки, закрытой до появления колонки: такая считается в `done`,
    // но не в недельной прибавке — иначе старый ремонт всплыл бы как свежий.
    if (row.doneAt !== null && row.doneAt.getTime() >= since) doneLastWeek += 1
  }

  return { done, doneLastWeek, queued, districts: districts.size }
}
