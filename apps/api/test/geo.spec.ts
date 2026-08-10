import { afterAll, describe, expect, it } from 'vitest'
import { GeoService } from '../src/geo/geo.service'
import { createTestPrisma } from './support/database'

const prisma = createTestPrisma()
const geo = new GeoService(prisma)

afterAll(async () => {
  await prisma.$disconnect()
})

/** Опорные точки из SRS §2.14, вычисленные по репозиторному GeoJSON. Эксклав
 *  Мирзо-Улугбекского района — меньшая часть его мультиполигона; он существует
 *  ровно затем, чтобы никто не «упростил» сид, разложив мультиполигон по строкам. */
const MIRZO_ULUGBEK_EXCLAVE = { longitude: 69.454308, latitude: 41.413567 }
const MIRZO_ULUGBEK_MAINLAND = { longitude: 69.362305, latitude: 41.337918 }

/** Города за геозабором: Самарканд — далеко, Чирчик — рядом, в 25 км от границы.
 *  Второй важнее: он проверяет, что отсекается именно граница города, а не расстояние. */
const SAMARKAND = { longitude: 66.9597, latitude: 39.627 }
const CHIRCHIQ = { longitude: 69.5822, latitude: 41.4689 }

interface SurfacePointRow {
  code: string
  longitude: number
  latitude: number
}

interface AreaRow {
  dataset_ha: number
  computed_ha: number
}

describe('district — сид из GeoJSON (SRS §2.6)', () => {
  it('даёт 12 районов, у всех геометрия MultiPolygon', async () => {
    const rows = await prisma.$queryRaw<{ total: bigint; multipolygons: bigint }[]>`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE GeometryType(geom::geometry) = 'MULTIPOLYGON') AS multipolygons
        FROM district`
    expect(rows[0]?.total).toBe(12n)
    expect(rows[0]?.multipolygons).toBe(12n)
  })

  it('совпадает по суммарной площади с датасетом в пределах 0,1%', async () => {
    const rows = await prisma.$queryRaw<AreaRow[]>`
      SELECT sum(area_ha)::float8 AS dataset_ha, (sum(ST_Area(geom)) / 10000)::float8 AS computed_ha
        FROM district`
    const row = rows[0]
    if (row === undefined) throw new Error('district table is empty')
    const deviation = Math.abs(row.computed_ha - row.dataset_ha) / row.dataset_ha
    expect(deviation).toBeLessThan(0.001)
  })
})

describe('GeoService.findDistrictCode (SRS §3.3)', () => {
  it('определяет район по точке внутри каждого из 12 полигонов', async () => {
    // Опорные точки не выписаны руками: ST_PointOnSurface даёт точку, гарантированно
    // лежащую внутри полигона, поэтому тест проверяет запрос, а не мою арифметику.
    const points = await prisma.$queryRaw<SurfacePointRow[]>`
      SELECT code,
             ST_X(ST_PointOnSurface(geom::geometry))::float8 AS longitude,
             ST_Y(ST_PointOnSurface(geom::geometry))::float8 AS latitude
        FROM district ORDER BY code`
    expect(points).toHaveLength(12)

    for (const point of points) {
      expect(await geo.findDistrictCode(point.latitude, point.longitude)).toBe(point.code)
    }
  })

  it('не отдаёт ни одну контрольную точку двум районам сразу', async () => {
    const rows = await prisma.$queryRaw<{ code: string; matches: bigint }[]>`
      SELECT p.code,
             (SELECT count(*) FROM district d
               WHERE ST_Contains(d.geom::geometry, p.point)) AS matches
        FROM (SELECT code, ST_PointOnSurface(geom::geometry) AS point FROM district) AS p`
    expect(rows.map((row) => row.matches)).toEqual(Array<bigint>(12).fill(1n))
  })

  it('находит эксклав Мирзо-Улугбекского района', async () => {
    expect(await geo.findDistrictCode(MIRZO_ULUGBEK_EXCLAVE.latitude, MIRZO_ULUGBEK_EXCLAVE.longitude)).toBe(
      'mirzo-ulugbek',
    )
    expect(await geo.findDistrictCode(MIRZO_ULUGBEK_MAINLAND.latitude, MIRZO_ULUGBEK_MAINLAND.longitude)).toBe(
      'mirzo-ulugbek',
    )
  })

  it('отклоняет точки вне города — это и есть геозабор', async () => {
    expect(await geo.findDistrictCode(SAMARKAND.latitude, SAMARKAND.longitude)).toBeNull()
    expect(await geo.findDistrictCode(CHIRCHIQ.latitude, CHIRCHIQ.longitude)).toBeNull()
  })
})
