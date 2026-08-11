import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Контраст палитры проверяется расчётом по объявленным парам «текст на фоне»,
 *  а не прогоном axe по каждому экрану (PRD §8.2, план 005).
 *
 *  Причина такая: нарушение контраста рождается не в разметке, а в правке токена —
 *  один `--text-2` тянет за собой каждую подпись на сайте. Тест ловит именно это
 *  и стоит миллисекунды, тогда как экранная проверка нашла бы то же самое позже,
 *  дороже и не на всех экранах сразу.
 *
 *  Обе темы: тёмная в 001 объявлена полностью, и незамеченной она ломается легче
 *  светлой — на неё смотрят реже. */
const AA_TEXT = 4.5
/** Крупный текст и нетекстовые элементы: границы полей, кольцо фокуса, знак на пине
 *  (WCAG 1.4.3 Large Text, 1.4.11 Non-text Contrast). */
const AA_LARGE = 3

type Theme = 'light' | 'dark'

const THEME_SELECTOR: Record<Theme, string> = {
  light: ':root {',
  dark: '[data-theme="dark"] {',
}

function declarations(selector: string): Map<string, string> {
  const css = readFileSync(new URL('./colors.css', import.meta.url), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  )
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`селектор ${selector} не объявлен`)
  const open = css.indexOf('{', start)
  const tokens = new Map<string, string>()
  for (const line of css.slice(open + 1, css.indexOf('}', open)).split(';')) {
    const [name, value] = line.split(':')
    if (name === undefined || value === undefined) continue
    tokens.set(name.trim(), value.trim())
  }
  return tokens
}

/** Тёмная тема переопределяет часть семантики и наследует остальное — как в браузере:
 *  `--asphalt-*` объявлены один раз, в `:root`, и в тёмном блоке их нет. */
function palette(theme: Theme): Map<string, string> {
  const light = declarations(THEME_SELECTOR.light)
  if (theme === 'light') return light
  return new Map([...light, ...declarations(THEME_SELECTOR.dark)])
}

function resolve(tokens: Map<string, string>, name: string): string {
  const value = tokens.get(name)
  if (value === undefined) throw new Error(`токен ${name} не объявлен`)
  const reference = /^var\((--[\w-]+)\)$/.exec(value)
  return reference === null ? value : resolve(tokens, reference[1] ?? '')
}

/** WCAG 2.x, Relative luminance. sRGB и никакого APCA: уровень AA определён через
 *  эту формулу, и считать надо ровно ею. */
function luminance(hex: string): number {
  const value = /^#([0-9a-f]{6})$/i.exec(hex)
  if (value === null) throw new Error(`не цвет: ${hex}`)
  const channels = [0, 2, 4].map((offset) => {
    const part = Number.parseInt((value[1] ?? '').slice(offset, offset + 2), 16) / 255
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

interface Pair {
  /** Что именно так покрашено — чтобы упавший тест назвал экран, а не только токены. */
  what: string
  fg: string
  bg: string
  min: number
  /** По умолчанию пара проверяется в обеих темах. Сужается там, где токен по замыслу
   *  существует только в одной: жёлтый как текст объявлен для светлого фона. */
  themes?: Theme[]
}

const SURFACES = ['--surface-page', '--surface-card', '--surface-sunken'] as const

const STATUSES = [
  'new',
  'accepted',
  'progress',
  'done',
  'rejected',
  'duplicate',
  'outofscope',
] as const

const PAIRS: Pair[] = [
  ...SURFACES.map((bg) => ({ what: `основной текст на ${bg}`, fg: '--text-1', bg, min: AA_TEXT })),
  ...SURFACES.map((bg) => ({ what: `подписи на ${bg}`, fg: '--text-2', bg, min: AA_TEXT })),

  // --text-3 живёт на белой карточке, --text-3-sunken — на подкрашенных поверхностях.
  // Разделение не косметическое: asphalt-500 даёт 4.54:1 на белом и 4.10:1 на
  // --surface-page, то есть на странице тот же токен уже не проходит AA.
  { what: 'приглушённый текст на карточке', fg: '--text-3', bg: '--surface-card', min: AA_TEXT },
  { what: 'приглушённый текст на странице', fg: '--text-3-sunken', bg: '--surface-page', min: AA_TEXT },
  {
    what: 'приглушённый текст на утопленной поверхности',
    fg: '--text-3-sunken',
    bg: '--surface-sunken',
    min: AA_TEXT,
  },
  { what: 'подпись основной кнопки', fg: '--text-on-accent', bg: '--accent', min: AA_TEXT },
  {
    what: 'жёлтый как текст на карточке',
    fg: '--signal-700',
    bg: '--surface-card',
    min: AA_TEXT,
    themes: ['light'],
  },
  { what: 'число в кластере на карте', fg: '--asphalt-0', bg: '--asphalt-700', min: AA_TEXT },

  // Текст ошибки формы стоит на самой странице, а не на своей плашке: он предупреждает
  // рядом с полем, а плашка увела бы его от поля (ReportForm, PointPicker, PhotoPicker).
  ...SURFACES.map((bg) => ({
    what: `текст ошибки на ${bg}`,
    fg: '--status-rejected-ink',
    bg,
    min: AA_TEXT,
  })),

  ...STATUSES.map((status) => ({
    what: `статус ${status}: текст на своей плашке`,
    fg: `--status-${status}-ink`,
    bg: `--status-${status}-tint`,
    min: AA_TEXT,
  })),
  ...STATUSES.map((status) => ({
    what: `статус ${status}: текст на заливке`,
    fg: '--status-on-solid',
    bg: `--status-${status}-solid`,
    min: AA_TEXT,
  })),

  // Знак статуса на пине — не украшение: в монохроме и при дихромазии заявку различает
  // именно он (AC-8), поэтому мерка нетекстовая, но обязательная.
  ...STATUSES.map((status) => ({
    what: `статус ${status}: знак на пине`,
    fg: '--pin-stroke',
    bg: `--status-${status}-pin`,
    min: AA_LARGE,
  })),

  // Граница поля ввода — единственное, чем пустое поле отличается от фона: без неё
  // житель не видит, куда писать (WCAG 1.4.11). Декоративный --border-1 сюда не входит:
  // он рисует рамку карточки, а карточку опознают по содержимому.
  ...SURFACES.map((bg) => ({
    what: `граница поля на ${bg}`,
    fg: '--border-2',
    bg,
    min: AA_LARGE,
  })),

  { what: 'кольцо фокуса на странице', fg: '--focus-ring', bg: '--surface-page', min: AA_LARGE },
  { what: 'кольцо фокуса на карточке', fg: '--focus-ring', bg: '--surface-card', min: AA_LARGE },
]

describe('контраст палитры (PRD §8.2, AC-5)', () => {
  for (const theme of ['light', 'dark'] as const) {
    const tokens = palette(theme)

    for (const pair of PAIRS.filter((pair) => pair.themes?.includes(theme) ?? true)) {
      it(`${theme}: ${pair.what} — не ниже ${pair.min}:1`, () => {
        const ratio = contrast(resolve(tokens, pair.fg), resolve(tokens, pair.bg))
        expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(pair.min)
      })
    }
  }

  it('считает контраст по формуле WCAG, а не приблизительно', () => {
    // Контроль на известных значениях: без него ошибка в самой формуле сделала бы
    // зелёными все проверки выше разом.
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    expect(contrast('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2)
  })
})
