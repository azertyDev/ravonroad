import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** WCAG 2.2 §2.5.8 Target Size (Minimum): 24×24 CSS-пикселя. Мы держим 44 и выше —
 *  запас на палец, а не на курсор (PRD §8.2).
 *
 *  Размер целей задан токенами, и компоненты берут их: `min-h-[var(--touch-base)]`.
 *  Уменьшить цель ниже порога можно ровно одним способом — правкой токена, и этот
 *  тест стоит именно там. Фактические прямоугольники на экране проверяются в браузере:
 *  для этого нужна раскладка, а не значения из файла. */
const FLOOR = 24

/** Токены, которыми объявлены зоны нажатия. `--cluster-size` и `--pin-size` сюда
 *  не входят: это размер рисунка, а зону нажатия под ним задаёт `--pin-hit`. */
const TARGET_TOKENS = ['--touch-min', '--touch-base', '--touch-cta', '--pin-hit'] as const

function pixels(token: string): number {
  const css = readFileSync(new URL('./spacing.css', import.meta.url), 'utf8')
  const declaration = new RegExp(`${token}:\\s*(\\d+)px`).exec(css)
  if (declaration === null) throw new Error(`токен ${token} не объявлен в px`)
  return Number(declaration[1])
}

describe('размер целей (PRD §8.2, AC-5)', () => {
  for (const token of TARGET_TOKENS) {
    it(`${token} не меньше ${FLOOR} CSS-px`, () => {
      expect(pixels(token)).toBeGreaterThanOrEqual(FLOOR)
    })
  }

  it('флажок фильтров растянут до порога базовым правилом', () => {
    // Браузерный флажок — 13 px, и никакой класс Tailwind на него не навешен:
    // размер приходит из базового слоя index.css. Без этой строки цель меньше нормы
    // у единственного элемента формы, который её не задаёт сам.
    const base = readFileSync(new URL('../../../index.css', import.meta.url), 'utf8')
    const rule = /input\[type="checkbox"\][\s\S]*?\}/.exec(base)?.[0] ?? ''
    const size = /(?:width|height):\s*var\((--[\w-]+)\)/.exec(rule)?.[1]
    expect(size).toBeDefined()
    expect(pixels(size ?? '')).toBeGreaterThanOrEqual(FLOOR)
  })
})
