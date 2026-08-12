import { describe, expect, it } from 'vitest'
import { formatCoordinate, nudge, NUDGE_FAST_M, NUDGE_STEP_M, parseCoordinate, roundCoordinate } from './coordinates'

/** Расстояние между точками по прямой, в метрах: тем же способом считает сервер
 *  (`apps/api/src/reports/nearby.ts`). Здесь нужно, чтобы проверять шаг в метрах,
 *  а не в градусах — в градусах он по долготе и широте разный. */
function distanceM(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number {
  const R = 6_371_000
  const toRad = (deg: number): number => (deg * Math.PI) / 180
  const dLat = toRad(to.latitude - from.latitude)
  const dLon = toRad(to.longitude - from.longitude)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

const TASHKENT = { latitude: 41.311081, longitude: 69.240562 }

describe('nudge — клавиатурный шаг пина (AC-2)', () => {
  it.each([
    ['на север', 0, NUDGE_STEP_M],
    ['на юг', 0, -NUDGE_STEP_M],
    ['на восток', NUDGE_STEP_M, 0],
    ['на запад', -NUDGE_STEP_M, 0],
  ])('сдвигает ровно на пять метров: %s', (_name, east, north) => {
    // Полметра допуска: координата округляется до шести знаков, то есть до 11 см.
    expect(distanceM(TASHKENT, nudge(TASHKENT, east, north))).toBeCloseTo(NUDGE_STEP_M, 0)
  })

  it('с Shift шаг вдесятеро длиннее', () => {
    expect(distanceM(TASHKENT, nudge(TASHKENT, NUDGE_FAST_M, 0))).toBeCloseTo(NUDGE_FAST_M, 0)
  })

  // Меридианы сходятся к полюсу: тот же шаг в метрах на широте Ташкента даёт больший
  // сдвиг в градусах долготы, чем на экваторе. Без поправки пин на восток ходил бы
  // медленнее, чем на север, — на 25% на этой широте.
  it('держит шаг в метрах, а не в градусах, поправляясь на широту', () => {
    const equator = { latitude: 0, longitude: 69.240562 }
    const eastAtEquator = nudge(equator, NUDGE_FAST_M, 0).longitude - equator.longitude
    const eastInTashkent = nudge(TASHKENT, NUDGE_FAST_M, 0).longitude - TASHKENT.longitude
    expect(eastInTashkent).toBeGreaterThan(eastAtEquator)
    expect(distanceM(equator, nudge(equator, NUDGE_FAST_M, 0))).toBeCloseTo(NUDGE_FAST_M, 0)
  })

  it('возвращает точку с той же точностью, что и остальные пути ввода', () => {
    const moved = nudge(TASHKENT, NUDGE_STEP_M, NUDGE_STEP_M)
    expect(moved.latitude).toBe(roundCoordinate(moved.latitude))
    expect(moved.longitude).toBe(roundCoordinate(moved.longitude))
  })
})

describe('координаты пина (AC-2)', () => {
  it('держит шесть знаков после запятой', () => {
    expect(roundCoordinate(41.2755123456)).toBe(41.275512)
    expect(formatCoordinate(41.2755)).toBe('41.275500')
  })

  it('принимает запятую как разделитель', () => {
    // Обычная раскладка даёт запятую, и требовать точку значило бы требовать
    // от человека знания формата.
    expect(parseCoordinate('41,275512')).toBe(41.275512)
    expect(parseCoordinate('  69.204411 ')).toBe(69.204411)
  })

  it('считает пустое поле пустым, а мусор — отсутствием значения', () => {
    expect(parseCoordinate('')).toBeNull()
    expect(parseCoordinate('   ')).toBeNull()
    expect(parseCoordinate('около рынка')).toBeNull()
  })

  it('переживает круг «пин → поле → пин» без потери точности', () => {
    // Поле и пин связаны с одним состоянием, и значение обязано пережить
    // преобразование в текст и обратно (T-039).
    const fromPin = roundCoordinate(41.2755124)
    expect(parseCoordinate(formatCoordinate(fromPin))).toBe(fromPin)
  })
})
