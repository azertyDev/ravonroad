import type { PublicStatus } from '@ravonroad/shared-types'
import type { FilterableReport } from './filters'

/** Радиус Земли, метры. Формула гаверсинуса даёт погрешность в доли процента —
 *  для «в 340 м отсюда» это на три порядка точнее, чем нужно. */
const EARTH_RADIUS_M = 6_371_000

/** Дальше этого заявка перестаёт быть соседней: три километра по прямой в Ташкенте —
 *  это уже другой район, и «рядом» про неё сказать нельзя. */
const MAX_DISTANCE_M = 3_000

export interface NearbyRow extends FilterableReport {
  number: number
}

export interface NearbyReport {
  number: number
  status: PublicStatus
  districtCode: string
  distanceM: number
}

export function distanceM(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180
  const dLat = toRad(to.latitude - from.latitude)
  const dLon = toRad(to.longitude - from.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a))))
}

/** Ближайшие публичные заявки к данной (список «Yaqin atrofda» на странице заявки).
 *
 *  Считается по снимку точек, который и так лежит в памяти процесса: отдельного запроса
 *  в БД у этого списка нет. На 10⁵ точек это один проход и сортировка нескольких
 *  десятков попавших в радиус — микросекунды против обращения к PostGIS на каждую
 *  открытую карточку.
 *
 *  Сама заявка исключается по номеру, а не по расстоянию: две заявки могут стоять
 *  в одной точке, и «0 м» — это сосед, а не дубль текущей карточки. */
export function nearest(
  rows: readonly NearbyRow[],
  origin: { number: number; latitude: number; longitude: number },
  limit: number,
): NearbyReport[] {
  return rows
    .filter((row) => row.number !== origin.number)
    .map((row) => ({
      number: row.number,
      status: row.status,
      districtCode: row.districtCode,
      distanceM: distanceM(origin, row),
    }))
    .filter((row) => row.distanceM <= MAX_DISTANCE_M)
    // Ничья по расстоянию разрывается номером: без этого порядок зависел бы от порядка
    // строк в снимке, и список прыгал бы между обновлениями кэша.
    .sort((left, right) => left.distanceM - right.distanceM || left.number - right.number)
    .slice(0, limit)
}
