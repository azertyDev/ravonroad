import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Два правила клавиатурного обхода, которые ломаются одной строкой в разметке
 *  и не видны ни на одном скриншоте (PRD §8.2, AC-6).
 *
 *  Проверка статическая — по исходникам, а не по экрану: собрать раскладку в node
 *  нечем, а обе ошибки живут в тексте компонента и ловятся там же. Сам проход
 *  с клавиатуры от этого не отменяется, он записан в PR среза. */
const SRC = fileURLToPath(new URL('../../', import.meta.url))

function sources(): { path: string; code: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    .map((name) => ({ path: name, code: readFileSync(SRC + name, 'utf8') }))
}

const FILES = sources()

function offenders(pattern: RegExp): string[] {
  return FILES.flatMap((file) =>
    file.code
      .split('\n')
      .filter((line) => pattern.test(line))
      .map((line) => `${file.path}: ${line.trim()}`),
  )
}

describe('клавиатурный обход (PRD §8.2, AC-6)', () => {
  it('читает исходники, а не пустоту', () => {
    expect(FILES.length).toBeGreaterThan(40)
  })

  it('не переставляет порядок фокуса положительным tabindex', () => {
    // Положительный tabindex вырывает элемент из порядка разметки и ставит его перед
    // всей остальной страницей: визуальный порядок и порядок обхода расходятся
    // (WCAG 2.4.3). `tabIndex={-1}` разрешён — это цель программного фокуса, а не шаг.
    expect(offenders(/tabIndex=\{[1-9]/)).toEqual([])
    expect(offenders(/tabIndex\s*=\s*[1-9]/)).toEqual([])
  })

  it('не гасит кольцо фокуса', () => {
    // `outline-none` в Tailwind и `outline: none` в CSS снимают единственный признак,
    // по которому человек за клавиатурой понимает, где он стоит (WCAG 2.4.7).
    // Класс `outline-hidden` из Tailwind v4 сюда не относится: он гасит контур только
    // там, где кольцо рисуется отдельно, и в разметке его нет.
    expect(offenders(/outline-none|outline:\s*none/)).toEqual([])
  })

  it('видит то, что ищет', () => {
    // Контроль самих правил: без него опечатка в шаблоне сделала бы обе проверки
    // зелёными навсегда.
    expect(offenders(/tabIndex=\{-1\}/).length).toBeGreaterThan(0)
  })
})
