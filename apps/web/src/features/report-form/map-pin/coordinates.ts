/** Точка на карте, выбранная жителем. Единственный источник координат заявки:
 *  геокодер не вызывается, EXIF не читается (ADR-0004, PRD §7.2). */
export interface Point {
  latitude: number
  longitude: number
}

/** 6 знаков ≈ 11 см. Больше не хранит и не принимает сервер, а меньше — это уже
 *  метры, то есть другая яма на той же улице. */
const PRECISION = 6

/** Центр Ташкента: с него начинается карта, пока житель не поставил пин.
 *  Это не координаты заявки — пустое поле остаётся пустым, пока его не заполнили. */
export const TASHKENT_CENTER: Point = { latitude: 41.311081, longitude: 69.240562 }

export function roundCoordinate(value: number): number {
  return Number(value.toFixed(PRECISION))
}

/** Разбирает то, что житель ввёл руками в числовое поле. Запятая как разделитель —
 *  обычное дело на русской и узбекской раскладке, и отвергать её значило бы
 *  требовать от человека знания формата. */
export function parseCoordinate(text: string): number | null {
  const normalized = text.replace(',', '.').trim()
  if (normalized === '') return null
  const value = Number(normalized)
  return Number.isFinite(value) ? roundCoordinate(value) : null
}

export function formatCoordinate(value: number): string {
  return value.toFixed(PRECISION)
}

/** Метров в градусе широты. По долготе столько же только на экваторе, дальше меридианы
 *  сходятся — поэтому шаг по долготе делится на косинус широты. */
const METERS_PER_DEGREE = 111_320

/** Шаг пина стрелкой. Пять метров — примерно длина ямы: мельче не нужно, крупнее
 *  промахивается мимо соседней. Shift переносит через квартал. */
export const NUDGE_STEP_M = 5
export const NUDGE_FAST_M = 50

/** Сдвигает точку на заданное число метров: восток по долготе, север по широте.
 *
 *  Существует ради клавиатуры. Пин двигают мышью или пальцем, а этих способов нет
 *  ни у человека за клавиатурой, ни при треморе — и точка обязательна для отправки,
 *  то есть без такого пути заявку просто не подать.
 *
 *  Косинус берётся у исходной широты: на масштабе города поправка от самого сдвига
 *  меньше сантиметра, а формула остаётся читаемой. */
export function nudge(point: Point, eastM: number, northM: number): Point {
  const scale = Math.cos((point.latitude * Math.PI) / 180)
  return {
    latitude: roundCoordinate(point.latitude + northM / METERS_PER_DEGREE),
    longitude: roundCoordinate(point.longitude + eastM / (METERS_PER_DEGREE * scale)),
  }
}
