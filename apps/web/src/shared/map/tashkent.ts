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

/** Сторона тайла MapLibre в пикселях. Не 256: библиотека считает масштаб по 512. */
const TILE_SIZE = 512

/** Доля мира по X в проекции Web Mercator: 0 на −180°, 1 на +180°. */
function mercatorX(lon: number): number {
  return (lon + 180) / 360
}

/** Доля мира по Y. Вверх по карте — меньше, поэтому северный край даёт меньшее число. */
function mercatorY(lat: number): number {
  const radians = (lat * Math.PI) / 180
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI)
}

/** Наименьший зум, при котором область закрывает окно целиком, — «cover», а не «contain».
 *
 *  `fitBounds` вписывает область внутрь окна, и на широком мониторе за её краями
 *  остаётся чернота: данных вне экстракта нет и не будет, а пустое поле рядом с картой
 *  читается как поломка, а не как край города. Отсюда обратная задача — не «вписать
 *  город в окно», а «не дать окну выйти за город»: этот зум становится `minZoom`,
 *  и вместе с `maxBounds` он держит в кадре только то, что нарисовано.
 *
 *  Считается по обеим осям и берётся больший: покрыть нужно и ширину, и высоту.
 *  Размер окна приходит снаружи, поэтому пересчитывается на каждом изменении размера —
 *  на телефоне в альбомной ориентации он другой. */
export function coverZoom(bounds: Bounds, width: number, height: number): number {
  const spanX = mercatorX(bounds.maxLon) - mercatorX(bounds.minLon)
  const spanY = mercatorY(bounds.minLat) - mercatorY(bounds.maxLat)
  // Окно нулевого размера бывает в момент монтирования: масштаба у него нет,
  // и вернуть тут можно только ноль — иначе `log2(0)` уводит зум в −∞.
  if (width <= 0 || height <= 0 || spanX <= 0 || spanY <= 0) return 0
  const scale = Math.max(width / (TILE_SIZE * spanX), height / (TILE_SIZE * spanY))
  return Math.log2(scale)
}
