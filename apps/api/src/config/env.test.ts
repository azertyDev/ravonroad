import { describe, expect, it } from 'vitest'
import { validateEnv } from './env'

const complete = {
  DATABASE_URL: 'postgresql://ravonroad:ravonroad@localhost:5432/ravonroad?schema=public',
  WEB_ORIGIN: 'http://localhost:5173',
  S3_ENDPOINT: 'https://storage.googleapis.com',
  S3_REGION: 'us-central1',
  S3_BUCKET: 'ravonroad-dev-photos',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_BASE_URL: 'https://storage.googleapis.com/ravonroad-dev-photos',
}

function without(name: keyof typeof complete): Record<string, string> {
  const source: Record<string, string> = { ...complete }
  delete source[name]
  return source
}

describe('validateEnv', () => {
  it('называет отсутствующую переменную', () => {
    expect(() => validateEnv(without('DATABASE_URL'))).toThrow(/DATABASE_URL is required/)
  })

  it('перечисляет все отсутствующие переменные разом', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL is required; WEB_ORIGIN is required/)
  })

  it('требует хранилище фотографий: без него заявка не принимается вовсе', () => {
    // Узнать об этом на старте процесса дешевле, чем на первой фотографии от жителя.
    expect(() => validateEnv(without('S3_BUCKET'))).toThrow(/S3_BUCKET is required/)
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

  it('подставляет восемь пропусков приёма и разбирает заданное число', () => {
    expect(validateEnv(complete).INTAKE_CONCURRENCY).toBe(8)
    expect(validateEnv({ ...complete, INTAKE_CONCURRENCY: '2' }).INTAKE_CONCURRENCY).toBe(2)
  })

  it('отклоняет ноль пропусков приёма: это остановленный приём, а не настройка', () => {
    expect(() => validateEnv({ ...complete, INTAKE_CONCURRENCY: '0' })).toThrow(/INTAKE_CONCURRENCY/)
    expect(() => validateEnv({ ...complete, INTAKE_CONCURRENCY: '-1' })).toThrow(/INTAKE_CONCURRENCY/)
  })

  it('отклоняет порт вне диапазона и не целый', () => {
    expect(() => validateEnv({ ...complete, API_PORT: '70000' })).toThrow(/API_PORT/)
    expect(() => validateEnv({ ...complete, API_PORT: '3000.5' })).toThrow(/API_PORT/)
    expect(() => validateEnv({ ...complete, API_PORT: 'nope' })).toThrow(/API_PORT/)
  })
})
