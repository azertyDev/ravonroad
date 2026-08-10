import { describe, expect, it } from 'vitest'
import { detectLocale, isLocale, LOCALES } from './locale'

describe('isLocale', () => {
  it('принимает только объявленные локали', () => {
    expect(LOCALES.every(isLocale)).toBe(true)
    for (const value of ['de', 'uz-UZ', 'RU', '', '../uz']) expect(isLocale(value)).toBe(false)
  })
})

describe('detectLocale', () => {
  it('даёт ru на русскоязычном браузере', () => {
    expect(detectLocale(['ru-RU', 'en-US'])).toBe('ru')
    expect(detectLocale(['ru'])).toBe('ru')
  })

  it('даёт uz на всём остальном и на пустых данных', () => {
    expect(detectLocale(['en-US', 'ru-RU'])).toBe('uz')
    expect(detectLocale(['uz-Latn-UZ'])).toBe('uz')
    expect(detectLocale([])).toBe('uz')
    expect(detectLocale(undefined)).toBe('uz')
  })
})
