import { describe, expect, it } from 'vitest'
import { coverZoom, TASHKENT_BOUNDS } from './tashkent'

/** Повторяет арифметику MapLibre: сколько пикселей занимает область на данном зуме. */
function spanPixels(zoom: number): { width: number; height: number } {
  const world = 512 * 2 ** zoom
  const x = (lon: number): number => ((lon + 180) / 360) * world
  const y = (lat: number): number => {
    const radians = (lat * Math.PI) / 180
    return (0.5 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / (2 * Math.PI)) * world
  }
  return {
    width: x(TASHKENT_BOUNDS.maxLon) - x(TASHKENT_BOUNDS.minLon),
    height: y(TASHKENT_BOUNDS.minLat) - y(TASHKENT_BOUNDS.maxLat),
  }
}

describe('coverZoom', () => {
  // Ради этого свойства функция и существует: на этом зуме за краем экстракта
  // не остаётся ни одного пикселя чёрного поля.
  it.each([
    ['широкий монитор', 2560, 1000],
    ['ноутбук', 1440, 900],
    ['полоса на телефоне', 390, 196],
    ['узкое и высокое окно', 400, 1200],
  ])('покрывает окно целиком: %s', (_name, width, height) => {
    const { width: spanW, height: spanH } = spanPixels(coverZoom(TASHKENT_BOUNDS, width, height))
    expect(spanW).toBeGreaterThanOrEqual(width - 0.001)
    expect(spanH).toBeGreaterThanOrEqual(height - 0.001)
  })

  it('на пол-пикселя ниже окно уже не закрыто — зум минимальный, а не с запасом', () => {
    const { width: spanW, height: spanH } = spanPixels(coverZoom(TASHKENT_BOUNDS, 1440, 900) - 0.01)
    expect(Math.min(spanW - 1440, spanH - 900)).toBeLessThan(0)
  })

  // Окно нулевой высоты бывает в первый кадр после монтирования: до раскладки
  // контейнер ещё пуст. Логарифм нуля уводит зум в −∞, и карта не восстанавливается.
  it('нулевой размер окна не уводит зум в минус бесконечность', () => {
    expect(coverZoom(TASHKENT_BOUNDS, 1440, 0)).toBe(0)
    expect(coverZoom(TASHKENT_BOUNDS, 0, 0)).toBe(0)
  })
})
