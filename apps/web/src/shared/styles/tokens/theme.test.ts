import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** Тёмные значения записаны в двух блоках — под системной настройкой и под явным
 *  переключателем. CSS не умеет объявить их один раз, поэтому копии сверяет тест:
 *  разъехавшись, они дадут тему, которая зависит от способа включения. */
const FILES = ['colors.css', 'effects.css'] as const

function read(file: string): string {
  return readFileSync(new URL(`./${file}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

function declarations(css: string, selector: string): string[] {
  const start = css.indexOf(selector)
  if (start < 0) throw new Error(`селектор ${selector} не объявлен`)
  const open = css.indexOf('{', start)
  return css
    .slice(open + 1, css.indexOf('}', open))
    .split(';')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort()
}

describe('тёмная тема', () => {
  for (const file of FILES) {
    it(`${file}: системная и переключённая объявляют одно и то же`, () => {
      const css = read(file)

      expect(declarations(css, ':root:not([data-theme="light"])')).toEqual(declarations(css, '[data-theme="dark"] {'))
    })
  }

  it('объявляет --edge-highlight и в светлой теме', () => {
    // Токен есть только в тёмном блоке — в светлой var() развернулся бы в пустоту.
    expect(declarations(read('effects.css'), ':root {')).toContain('--edge-highlight: 1px solid transparent')
  })
})
