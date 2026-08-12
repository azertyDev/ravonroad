import { describe, expect, it } from 'vitest'
import { validateEnv } from './env'

const complete = {
  DATABASE_URL: 'postgresql://ravonroad:ravonroad@localhost:5432/ravonroad?schema=public',
  WEB_ORIGIN: 'http://localhost:5173',
  PUBLIC_SITE_URL: 'http://localhost',
  S3_ENDPOINT: 'https://storage.googleapis.com',
  S3_REGION: 'us-central1',
  S3_BUCKET: 'ravonroad-dev-photos',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_BASE_URL: 'https://storage.googleapis.com/ravonroad-dev-photos',
  TELEGRAM_BOT_TOKEN: '1234:token',
  TELEGRAM_GROUP_CHAT_ID: '-1001234567890',
  TELEGRAM_WEBHOOK_SECRET: 'secret',
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

  it('требует адрес сайта: без него в карточке бота ссылка на заявку не соберётся', () => {
    expect(() => validateEnv(without('PUBLIC_SITE_URL'))).toThrow(/PUBLIC_SITE_URL is required/)
  })

  it('требует хранилище фотографий: без него заявка не принимается вовсе', () => {
    // Узнать об этом на старте процесса дешевле, чем на первой фотографии от жителя.
    expect(() => validateEnv(without('S3_BUCKET'))).toThrow(/S3_BUCKET is required/)
  })

  it('требует доступ к Telegram: без него модерация встаёт молча', () => {
    // Карточки копились бы в очереди, и отказ заметили бы через часы, а не на старте.
    expect(() => validateEnv(without('TELEGRAM_BOT_TOKEN'))).toThrow(/TELEGRAM_BOT_TOKEN is required/)
    expect(() => validateEnv(without('TELEGRAM_WEBHOOK_SECRET'))).toThrow(/TELEGRAM_WEBHOOK_SECRET is required/)
  })

  it('оставляет необязательными путь webhook, адрес Bot API и засев модераторов', () => {
    const env = validateEnv(complete)
    expect(env.TELEGRAM_WEBHOOK_PATH).toBeUndefined()
    expect(env.TELEGRAM_API_BASE_URL).toBeUndefined()
    // Пустая строка — это «не задано»: в .env она чаще остаётся от примера, чем
    // выставляется намеренно.
    expect(validateEnv({ ...complete, TELEGRAM_MODERATOR_IDS: '  ' }).TELEGRAM_MODERATOR_IDS).toBeUndefined()
    expect(validateEnv({ ...complete, TELEGRAM_MODERATOR_IDS: '1,2' }).TELEGRAM_MODERATOR_IDS).toBe('1,2')
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

  it('принимает ноль воркеров фото: так очередь останавливают, не трогая приём', () => {
    expect(validateEnv({ ...complete, PHOTO_WORKERS: '0' }).PHOTO_WORKERS).toBe(0)
    expect(validateEnv(complete).PHOTO_WORKERS).toBe(1)
    expect(() => validateEnv({ ...complete, PHOTO_WORKERS: '-1' })).toThrow(/PHOTO_WORKERS/)
  })

  it('отклоняет порт вне диапазона и не целый', () => {
    expect(() => validateEnv({ ...complete, API_PORT: '70000' })).toThrow(/API_PORT/)
    expect(() => validateEnv({ ...complete, API_PORT: '3000.5' })).toThrow(/API_PORT/)
    expect(() => validateEnv({ ...complete, API_PORT: 'nope' })).toThrow(/API_PORT/)
  })
})
