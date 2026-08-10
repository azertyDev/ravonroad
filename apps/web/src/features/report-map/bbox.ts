import { TASHKENT_BOUNDS, type Bounds } from '../../shared/map/tashkent'

/** Шаг сетки, к которой прижимается видимая область: 0,01° ≈ 1,1 км.
 *
 *  Точный прямоугольник экрана в запросе означал бы новый ключ на каждый пиксель
 *  панорамирования: и новый запрос к API, и промах микрокэша nginx у каждого посетителя —
 *  то есть ровно то, против чего этот кэш и ставился (SRS §4.7). Сетка склеивает мелкие
 *  сдвиги в один ключ, а обзор города целиком, с которого начинают все, даёт один и тот же
 *  ключ у всех — на нём анонс и держится (SRS §1.6).
 *
 *  Цена — до 1,1 км лишних точек за краем экрана. Они всё равно попадают в кластеры. */
const GRID = 0.01

/** Два знака ровно потому, что шаг — сотые доли градуса: `Math.floor(69.122342 / 0.01) * 0.01`
 *  даёт `69.12000000000001`, и без округления строка ключа зависела бы от ошибки двоичного
 *  представления, а не от того, куда смотрит житель. */
const DIGITS = 2

function snapDown(value: number): number {
  return Math.floor(value / GRID) * GRID
}

function snapUp(value: number): number {
  return Math.ceil(value / GRID) * GRID
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Город, прижатый к той же сетке. Дальше его границ данных нет: экстракт вырезан
 *  по ним, и заявка за ними не создаётся (SRS §3.3). */
const CITY: Bounds = {
  minLon: snapDown(TASHKENT_BOUNDS.minLon),
  minLat: snapDown(TASHKENT_BOUNDS.minLat),
  maxLon: snapUp(TASHKENT_BOUNDS.maxLon),
  maxLat: snapUp(TASHKENT_BOUNDS.maxLat),
}

/** Видимая область → значение параметра `bbox`: `minLon,minLat,maxLon,maxLat`. */
export function quantizeBbox(bounds: Bounds): string {
  const values = [
    clamp(snapDown(bounds.minLon), CITY.minLon, CITY.maxLon),
    clamp(snapDown(bounds.minLat), CITY.minLat, CITY.maxLat),
    clamp(snapUp(bounds.maxLon), CITY.minLon, CITY.maxLon),
    clamp(snapUp(bounds.maxLat), CITY.minLat, CITY.maxLat),
  ]
  return values.map((value) => value.toFixed(DIGITS)).join(',')
}

/** Стартовый ключ: город целиком. Его же вернёт `quantizeBbox` на любом экране,
 *  где виден весь Ташкент, — поэтому первый запрос у всех посетителей одинаковый. */
export const CITY_BBOX = quantizeBbox(TASHKENT_BOUNDS)

/** Попадание точки в город — приблизительно, по 12 прямоугольникам районов.
 *
 *  Полигоны на клиент не приезжают: 268 КБ это четверть бюджета первой загрузки
 *  (PRD §8.1), а точный ответ всё равно даёт сервер при создании заявки (SRS §3.3).
 *  Здесь решается ровно одно: вести ли карту к жителю или оставить её на городе (US-002).
 *  Ошибка приближения — полоса между границей района и его прямоугольником; житель
 *  в ней увидит карту у себя, а не сообщение. Это дешевле, чем обратная ошибка. */
export function insideAny(areas: Bounds[], longitude: number, latitude: number): boolean {
  return areas.some(
    (area) =>
      longitude >= area.minLon &&
      longitude <= area.maxLon &&
      latitude >= area.minLat &&
      latitude <= area.maxLat,
  )
}

/** Окрестность точки жителя: ±0,003° — примерно квартал вокруг. Карте нужен
 *  прямоугольник, а не точка: подгонка границ — единственный способ двигать карту,
 *  и второй ради одного случая заводить незачем. */
export function around(longitude: number, latitude: number): Bounds {
  const RADIUS = 0.003
  return {
    minLon: longitude - RADIUS,
    minLat: latitude - RADIUS,
    maxLon: longitude + RADIUS,
    maxLat: latitude + RADIUS,
  }
}
