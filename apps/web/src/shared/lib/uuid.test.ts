import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUuid } from './uuid'

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Настоящий генератор берётся до подмены: обращение к `crypto` внутри заглушки
 *  попало бы в саму заглушку и ушло в бесконечную рекурсию. */
const getRandomValues = crypto.getRandomValues.bind(crypto)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('randomUuid', () => {
  it('возвращает uuid v4', () => {
    expect(randomUuid()).toMatch(V4)
  })

  it('работает без crypto.randomUUID — это незащищённый контекст, а не поломка', () => {
    vi.stubGlobal('crypto', { getRandomValues })
    expect(randomUuid()).toMatch(V4)
  })

  it('не повторяется', () => {
    const values = new Set(Array.from({ length: 64 }, () => randomUuid()))
    expect(values.size).toBe(64)
  })
})
