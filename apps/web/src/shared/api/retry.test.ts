import { describe, expect, it } from 'vitest'
import { ApiRequestError } from './client'
import { retryQuery } from './retry'

describe('retryQuery', () => {
  // Тот самый случай: страница несуществующей заявки семь секунд крутила спиннер,
  // потому что `404` повторялся трижды с растущей паузой.
  it('не повторяет ответ, который повтором не исправить', () => {
    expect(retryQuery(0, new ApiRequestError('NOT_FOUND', 'x'))).toBe(false)
    expect(retryQuery(0, new ApiRequestError('VALIDATION_FAILED', 'x'))).toBe(false)
    expect(retryQuery(0, new ApiRequestError('OUTSIDE_TASHKENT', 'x'))).toBe(false)
    expect(retryQuery(0, new ApiRequestError('INVALID_CURSOR', 'x'))).toBe(false)
  })

  it('повторяет то, что может пройти со второй попытки', () => {
    // У бордюра сеть пропадает на секунды, и это как раз тот случай.
    expect(retryQuery(0, new TypeError('Failed to fetch'))).toBe(true)
    expect(retryQuery(0, new ApiRequestError('INTERNAL_ERROR', 'x'))).toBe(true)
    expect(retryQuery(0, new ApiRequestError('STORAGE_UNAVAILABLE', 'x'))).toBe(true)
  })

  it('останавливается после двух попыток: платный трафик за один и тот же ответ', () => {
    expect(retryQuery(1, new ApiRequestError('INTERNAL_ERROR', 'x'))).toBe(true)
    expect(retryQuery(2, new ApiRequestError('INTERNAL_ERROR', 'x'))).toBe(false)
  })
})
