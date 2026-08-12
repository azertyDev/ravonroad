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
const TARGET_TOKENS = [
  '--touch-check',
  '--touch-min',
  '--touch-base',
  '--touch-field',
  '--touch-cta',
  '--pin-hit',
] as const

const spacing = readFileSync(new URL('./spacing.css', import.meta.url), 'utf8')
const base = readFileSync(new URL('../../../index.css', import.meta.url), 'utf8')
const controls = readFileSync(new URL('../../ui/control/styles.ts', import.meta.url), 'utf8')

function pixels(token: string): number {
  const declaration = new RegExp(`${token}:\\s*(\\d+)px`).exec(spacing)
  if (declaration === null) throw new Error(`токен ${token} не объявлен в px`)
  return Number(declaration[1])
}

describe('размер целей (PRD §8.2, AC-5)', () => {
  for (const token of TARGET_TOKENS) {
    it(`${token} не меньше ${FLOOR} CSS-px`, () => {
      expect(pixels(token)).toBeGreaterThanOrEqual(FLOOR)
    })
  }

  it('флажок растянут до порога базовым правилом', () => {
    // Браузерный флажок — 13 px, и никакой класс Tailwind на него не навешен:
    // размер приходит из базового слоя index.css. Без этой строки цель меньше нормы
    // у единственного элемента фильтров, который её не задаёт сам.
    const rule = /input\[type="checkbox"\][\s\S]*?\}/.exec(base)?.[0] ?? ''
    const size = /(?:width|height):\s*var\((--[\w-]+)\)/.exec(rule)?.[1]
    expect(size).toBeDefined()
    expect(pixels(size ?? '')).toBeGreaterThanOrEqual(FLOOR)
  })

  /** Классы органов управления — единственное место, где высота цели задана строкой,
   *  а не элементом: кнопка здесь бывает и `<button>`, и `<a>`, и `<label>`. Каждый
   *  из них обязан назвать токен зоны нажатия, а не число в пикселях. */
  it('каждый класс кнопки и поля берёт высоту из токена зоны нажатия', () => {
    const named = ['CTA', 'CTA_MUTED', 'SECONDARY', 'COMPACT', 'COMPACT_ACCENT', 'ICON_BUTTON', 'FIELD', 'FIELD_INVALID']
    const missing = named.filter((name) => {
      const declaration = new RegExp(`export const ${name} =[\\s\\S]*?\\n\\n`).exec(controls)?.[0] ?? ''
      const token = /(?:min-h|h)-\[var\((--touch-[\w-]+)\)\]/.exec(declaration)?.[1]
      return token === undefined || pixels(token) < FLOOR
    })

    expect(missing).toEqual([])
  })
})
