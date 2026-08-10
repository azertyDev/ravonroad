/** Границы экстракта PMTiles, они же границы кампании (SRS §3.2, ADR-0008).
 *
 *  Модуль намеренно не знает про MapLibre: его читают и карта, и разбор bbox для
 *  запроса, а второй тянуть за собой 322 КБ библиотеки не должен. */
export interface Bounds {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

export const TASHKENT_BOUNDS: Bounds = {
  minLon: 69.122342,
  minLat: 41.163456,
  maxLon: 69.469873,
  maxLat: 41.422465,
}
