import { describe, expect, it } from 'vitest'
import { pluralForm } from './plural'

describe('pluralForm', () => {
  it('знает про русское исключение на 11–14', () => {
    // Правило «по последней цифре» здесь и ломается: 1 — «район», 11 — «районов».
    expect(pluralForm('ru', 1)).toBe('one')
    expect(pluralForm('ru', 21)).toBe('one')
    expect(pluralForm('ru', 11)).toBe('many')
    expect(pluralForm('ru', 2)).toBe('few')
    expect(pluralForm('ru', 5)).toBe('many')
    expect(pluralForm('ru', 0)).toBe('many')
  })

  it('в узбекском различает только единицу', () => {
    expect(pluralForm('uz', 1)).toBe('one')
    expect(pluralForm('uz', 2)).toBe('other')
    expect(pluralForm('uz', 0)).toBe('other')
  })
})
