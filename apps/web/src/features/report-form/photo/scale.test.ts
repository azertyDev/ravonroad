import { describe, expect, it } from 'vitest'
import { fitWithin, TARGET_LONG_SIDE } from './scale'

describe('fitWithin (SRS §5.2)', () => {
  it('уменьшает фотографию с телефона до 1600 px по длинной стороне', () => {
    expect(fitWithin({ width: 4000, height: 3000 })).toEqual({ width: 1600, height: 1200 })
    expect(fitWithin({ width: 3000, height: 4000 })).toEqual({ width: 1200, height: 1600 })
  })

  it('не увеличивает то, что меньше предела', () => {
    // Растянутый кадр не добавляет ни пикселя информации, зато утяжеляет файл,
    // за который житель платит мобильным трафиком.
    expect(fitWithin({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 })
    expect(fitWithin({ width: TARGET_LONG_SIDE, height: 900 })).toEqual({
      width: TARGET_LONG_SIDE,
      height: 900,
    })
  })

  it('сохраняет пропорции квадрата и панорамы', () => {
    expect(fitWithin({ width: 2400, height: 2400 })).toEqual({ width: 1600, height: 1600 })
    expect(fitWithin({ width: 8000, height: 1000 })).toEqual({ width: 1600, height: 200 })
  })

  it('никогда не даёт нулевую сторону', () => {
    // Холст нулевой ширины бросает исключение, а кадр 1×20000 — не повод ронять форму.
    expect(fitWithin({ width: 1, height: 20_000 })).toEqual({ width: 1, height: 1600 })
  })

  it('принимает произвольный предел — им же считается превью', () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 400)).toEqual({ width: 400, height: 300 })
  })
})
