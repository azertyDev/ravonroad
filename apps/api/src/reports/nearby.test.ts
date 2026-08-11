import { describe, expect, it } from 'vitest'
import { distanceM, nearest, type NearbyRow } from './nearby'

const CENTER = { latitude: 41.311081, longitude: 69.240562 }

function row(over: Partial<NearbyRow> & { number: number }): NearbyRow {
  return {
    status: 'NEW',
    categoryCode: 'roadway_pothole',
    districtCode: 'chilonzor',
    latitude: CENTER.latitude,
    longitude: CENTER.longitude,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    doneAt: null,
    ...over,
  }
}

describe('distanceM', () => {
  it('считает по дуге, а не по разнице градусов', () => {
    // Один градус долготы на широте Ташкента — около 83,6 км, а не 111.
    const oneDegreeEast = distanceM(CENTER, { ...CENTER, longitude: CENTER.longitude + 1 })
    expect(oneDegreeEast).toBeGreaterThan(83_000)
    expect(oneDegreeEast).toBeLessThan(84_500)
  })

  it('нулевое расстояние до самой себя', () => {
    expect(distanceM(CENTER, CENTER)).toBe(0)
  })
})

describe('nearest', () => {
  it('сортирует по расстоянию и обрезает по лимиту', () => {
    const result = nearest(
      [
        row({ number: 2, latitude: CENTER.latitude + 0.02 }),
        row({ number: 3, latitude: CENTER.latitude + 0.001 }),
        row({ number: 4, latitude: CENTER.latitude + 0.005 }),
      ],
      { number: 1, ...CENTER },
      2,
    )
    expect(result.map((item) => item.number)).toEqual([3, 4])
    expect(result[0]?.distanceM).toBeLessThan(result[1]?.distanceM ?? 0)
  })

  it('выбрасывает саму заявку по номеру, а не по нулевому расстоянию', () => {
    // Две заявки в одной точке — обычное дело: яма и трещина рядом.
    const result = nearest([row({ number: 1 }), row({ number: 9 })], { number: 1, ...CENTER }, 5)
    expect(result.map((item) => item.number)).toEqual([9])
    expect(result[0]?.distanceM).toBe(0)
  })

  it('не берёт то, что дальше трёх километров', () => {
    const result = nearest([row({ number: 2, latitude: CENTER.latitude + 0.05 })], { number: 1, ...CENTER }, 5)
    expect(result).toEqual([])
  })

  it('разрывает ничью номером, чтобы список не прыгал между обновлениями кэша', () => {
    const result = nearest([row({ number: 8 }), row({ number: 5 })], { number: 1, ...CENTER }, 5)
    expect(result.map((item) => item.number)).toEqual([5, 8])
  })
})
