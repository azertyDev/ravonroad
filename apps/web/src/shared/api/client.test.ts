import { describe, expect, it } from 'vitest'
import { parseApiError } from './client'

const CORRELATION = '01J9F7K2W8N4Q3ABCDEFGHJKMN'

describe('parseApiError', () => {
  it('разбирает тело SRS §8.1 с деталями валидации', () => {
    const error = parseApiError(400, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'photos are required',
        correlationId: CORRELATION,
        details: [{ field: 'photos', code: 'PHOTOS_REQUIRED' }],
      },
    }, '')

    expect(error.code).toBe('VALIDATION_FAILED')
    expect(error.correlationId).toBe(CORRELATION)
    expect(error.details).toEqual([{ field: 'photos', code: 'PHOTOS_REQUIRED' }])
  })

  it('не тащит details в коды, которым они не положены', () => {
    const error = parseApiError(404, {
      error: { code: 'NOT_FOUND', message: 'gone', correlationId: CORRELATION, details: [{ field: 'x', code: 'Y' }] },
    }, '')

    expect(error.code).toBe('NOT_FOUND')
    expect(error.details).toEqual([])
  })

  it('не принимает details, которые не массив', () => {
    for (const details of [{ field: 'photos' }, 'photos', 1, null]) {
      const error = parseApiError(400, {
        error: { code: 'VALIDATION_FAILED', message: 'bad', correlationId: CORRELATION, details },
      }, '')

      expect(error.code).toBe('VALIDATION_FAILED')
      expect(error.details).toEqual([])
    }
  })

  it('переводит стандартный 404 Nest в NOT_FOUND и берёт id из заголовка', () => {
    const error = parseApiError(404, { message: 'Cannot GET /api/nope', error: 'Not Found', statusCode: 404 }, CORRELATION)

    expect(error.code).toBe('NOT_FOUND')
    expect(error.correlationId).toBe(CORRELATION)
  })

  it('переводит неразобранный ответ в INTERNAL_ERROR', () => {
    for (const body of [undefined, null, '<html>502 Bad Gateway</html>', {}, { error: null }, { error: { code: 'NOT_FOUND' } }]) {
      expect(parseApiError(502, body, CORRELATION).code).toBe('INTERNAL_ERROR')
    }
  })

  it('не доверяет коду, которого нет в контракте', () => {
    // Код из сервера новее собранного клиента: словаря локали для него нет, и показать
    // жителю пустое место хуже, чем общий текст об ошибке (SRS §8.1).
    const error = parseApiError(400, {
      error: { code: 'PHOTO_TOO_BLURRY', message: 'from a newer server', correlationId: CORRELATION },
    }, CORRELATION)

    expect(error.code).toBe('INTERNAL_ERROR')
  })
})
