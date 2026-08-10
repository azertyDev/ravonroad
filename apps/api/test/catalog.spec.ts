import type { CategoryDto, DistrictDto } from '@ravonroad/shared-types'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { startTestApp, type TestApp } from './support/app'

let app: TestApp

beforeAll(async () => {
  app = await startTestApp()
})

afterAll(async () => {
  await app.close()
})

describe('GET /api/districts (SRS §4.6)', () => {
  it('отдаёт 12 районов с bbox и суточным кэшем', async () => {
    const response = await fetch(`${app.baseUrl}/api/districts`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')

    const districts = (await response.json()) as DistrictDto[]
    expect(districts).toHaveLength(12)

    const codes = districts.map((district) => district.code)
    expect(codes).toContain('mirzo-ulugbek')
    expect(new Set(codes).size).toBe(12)

    for (const district of districts) {
      expect(district.nameUz).not.toBe('')
      expect(district.nameRu).not.toBe('')
      // Прямоугольник обязан быть невырожденным: нулевой bbox не подгонит карту
      // ни подо что, а заметить это на глаз в JSON невозможно.
      expect(district.bbox.maxLon).toBeGreaterThan(district.bbox.minLon)
      expect(district.bbox.maxLat).toBeGreaterThan(district.bbox.minLat)
    }
  })

  it('не отдаёт геометрию: 268 КБ полигонов не помещаются в бюджет страницы', async () => {
    const response = await fetch(`${app.baseUrl}/api/districts`)
    const body = await response.text()
    expect(body).not.toContain('geom')
    expect(body).not.toContain('coordinates')
  })
})

describe('GET /api/categories (SRS §4.6)', () => {
  it('отдаёт активные категории в порядке сортировки, с тем же кэшем', async () => {
    const response = await fetch(`${app.baseUrl}/api/categories`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400')

    const categories = (await response.json()) as CategoryDto[]
    expect(categories.length).toBeGreaterThan(0)
    expect(categories.map((category) => category.code)).toContain('roadway_pothole')
    // «Другое» стоит последней: это запасной вариант, а не равноправный пункт списка.
    expect(categories.at(-1)?.code).toBe('other')

    for (const category of categories) {
      expect(category.nameUz).not.toBe('')
      expect(category.nameRu).not.toBe('')
    }
  })
})
