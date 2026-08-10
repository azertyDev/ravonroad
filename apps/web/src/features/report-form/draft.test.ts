import { describe, expect, it } from 'vitest'
import { DRAFT_TTL_MS, isExpired } from './draft'

const SAVED_AT = Date.parse('2026-08-10T09:00:00.000Z')

describe('срок жизни черновика (US-016, SRS §7.6)', () => {
  it('держит черновик сутки', () => {
    expect(isExpired(SAVED_AT, SAVED_AT)).toBe(false)
    expect(isExpired(SAVED_AT, SAVED_AT + DRAFT_TTL_MS - 1)).toBe(false)
  })

  it('считает просроченным ровно через сутки', () => {
    // Граница включающая: «прошло больше 24 часов — черновик удалён» (AC-6), и
    // ровно на сутках он уже не восстанавливается.
    expect(isExpired(SAVED_AT, SAVED_AT + DRAFT_TTL_MS)).toBe(true)
    expect(isExpired(SAVED_AT, SAVED_AT + DRAFT_TTL_MS + 1)).toBe(true)
  })

  it('не воскрешает черновик при переведённых назад часах', () => {
    // Часы на телефоне переводят руками и они уходят при смене часового пояса;
    // отрицательный возраст — это «ещё не просрочен», а не ошибка.
    expect(isExpired(SAVED_AT, SAVED_AT - 60_000)).toBe(false)
  })

  it('живёт сутки, а не час и не неделю', () => {
    expect(DRAFT_TTL_MS).toBe(24 * 60 * 60 * 1000)
  })
})
