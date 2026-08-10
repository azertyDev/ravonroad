import { describe, expect, it } from 'vitest'
import { validateEnv } from './env'

const complete = {
  DATABASE_URL: 'postgresql://ravonroad:ravonroad@localhost:5432/ravonroad?schema=public',
  WEB_ORIGIN: 'http://localhost:5173',
}

describe('validateEnv', () => {
  it('называет отсутствующую переменную', () => {
    expect(() => validateEnv({ WEB_ORIGIN: complete.WEB_ORIGIN })).toThrow(/DATABASE_URL is required/)
  })

  it('перечисляет все отсутствующие переменные разом', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL is required; WEB_ORIGIN is required/)
  })

  it('не принимает пустую строку за заданное значение', () => {
    expect(() => validateEnv({ ...complete, DATABASE_URL: '   ' })).toThrow(/DATABASE_URL is required/)
  })

  it('подставляет порт по умолчанию', () => {
    expect(validateEnv(complete).API_PORT).toBe(3000)
  })

  it('разбирает заданный порт', () => {
    expect(validateEnv({ ...complete, API_PORT: '8080' }).API_PORT).toBe(8080)
  })

  it('отклоняет порт вне диапазона и не целый', () => {
    expect(() => validateEnv({ ...complete, API_PORT: '70000' })).toThrow(/API_PORT/)
    expect(() => validateEnv({ ...complete, API_PORT: '3000.5' })).toThrow(/API_PORT/)
    expect(() => validateEnv({ ...complete, API_PORT: 'nope' })).toThrow(/API_PORT/)
  })
})
