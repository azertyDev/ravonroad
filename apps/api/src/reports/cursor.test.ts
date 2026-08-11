import { describe, expect, it } from 'vitest'
import type { ApiException } from '../common/api-error'
import { decodeCursor, encodeCursor } from './cursor'

describe('курсор списка', () => {
  it('переживает кодирование и разбор', () => {
    const cursor = { createdAt: new Date('2026-08-10T09:12:44.101Z'), number: 3471 }

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
  })

  it('не несёт внутренний ключ заявки — только номер и время', () => {
    const encoded = encodeCursor({ createdAt: new Date(1765376364101), number: 3471 })

    expect(Buffer.from(encoded, 'base64url').toString()).toBe('1765376364101.3471')
  })

  it('отвергает мусор кодом INVALID_CURSOR, а не сбросом на первую страницу', () => {
    for (const raw of ['', 'not-a-cursor', encodeCursor({ createdAt: new Date(0), number: 0 }), 'MTIz']) {
      let code: string | undefined
      try {
        decodeCursor(raw)
      } catch (error) {
        code = (error as ApiException).code
      }
      expect(code).toBe('INVALID_CURSOR')
    }
  })
})
