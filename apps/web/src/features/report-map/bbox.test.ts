import { describe, expect, it } from 'vitest'
import { TASHKENT_BOUNDS } from '../../shared/map/tashkent'
import { around, CITY_BBOX, insideAny, quantizeBbox } from './bbox'

describe('bbox для запроса карты', () => {
  it('склеивает мелкие сдвиги в один ключ', () => {
    const start = { minLon: 69.2, minLat: 41.3, maxLon: 69.21, maxLat: 41.31 }
    const nudged = { minLon: 69.2009, minLat: 41.3009, maxLon: 69.2099, maxLat: 41.3099 }

    expect(quantizeBbox(nudged)).toBe(quantizeBbox(start))
  })

  it('меняет ключ, когда область ушла за ячейку сетки', () => {
    const here = { minLon: 69.2, minLat: 41.3, maxLon: 69.21, maxLat: 41.31 }
    const there = { minLon: 69.22, minLat: 41.3, maxLon: 69.23, maxLat: 41.31 }

    expect(quantizeBbox(there)).not.toBe(quantizeBbox(here))
  })

  it('обрезает область по городу: у всех, кто видит Ташкент целиком, ключ один', () => {
    const wholeWorld = { minLon: -180, minLat: -85, maxLon: 180, maxLat: 85 }

    expect(quantizeBbox(wholeWorld)).toBe(CITY_BBOX)
    expect(quantizeBbox(TASHKENT_BOUNDS)).toBe(CITY_BBOX)
  })

  it('отдаёт четыре числа с двумя знаками, без хвостов двоичного округления', () => {
    expect(CITY_BBOX).toBe('69.12,41.16,69.47,41.43')
  })
})

describe('положение жителя', () => {
  const chilonzor = { minLon: 69.15, minLat: 41.24, maxLon: 69.25, maxLat: 41.31 }
  const yunusobod = { minLon: 69.24, minLat: 41.32, maxLon: 69.35, maxLat: 41.42 }

  it('узнаёт точку в любом из районов', () => {
    expect(insideAny([chilonzor, yunusobod], 69.2, 41.28)).toBe(true)
    expect(insideAny([chilonzor, yunusobod], 69.3, 41.4)).toBe(true)
  })

  it('не считает своим того, кто открыл сайт из Самарканда', () => {
    expect(insideAny([chilonzor, yunusobod], 66.96, 39.65)).toBe(false)
  })

  it('строит вокруг точки квартал, а не точку', () => {
    const bounds = around(69.2, 41.3)

    expect(bounds.maxLon - bounds.minLon).toBeCloseTo(0.006, 6)
    expect(bounds.maxLat - bounds.minLat).toBeCloseTo(0.006, 6)
  })
})
