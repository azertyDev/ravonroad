import { describe, expect, it } from 'vitest'
import { parseCreateReport } from './create-report.input'

const valid = {
  latitude: '41.275512',
  longitude: '69.204411',
  categoryCode: 'roadway_pothole',
}

function parseOrThrow(raw: Record<string, unknown>) {
  const result = parseCreateReport(raw)
  if (!result.ok) throw new Error(`unexpected errors: ${JSON.stringify(result.errors)}`)
  return result.value
}

function errorsOf(raw: Record<string, unknown>): string[] {
  const result = parseCreateReport(raw)
  return result.ok ? [] : result.errors.map((error) => error.field)
}

describe('parseCreateReport (SRS §4.2)', () => {
  it('разбирает минимально заполненную форму', () => {
    expect(parseOrThrow(valid)).toEqual({
      latitude: 41.275512,
      longitude: 69.204411,
      categoryCode: 'roadway_pothole',
      landmark: null,
      contactPhone: null,
      contactTelegram: null,
      locale: 'uz',
      honeypotFilled: false,
      formOpenedAt: null,
    })
  })

  it('называет каждое незаполненное обязательное поле, а не первое', () => {
    // Форма переводит фокус на первое проблемное поле и подсвечивает остальные;
    // с одной ошибкой за раз житель отправлял бы её трижды (US-006).
    expect(errorsOf({})).toEqual(['latitude', 'longitude', 'categoryCode'])
  })

  it('ловит перепутанные местами широту и долготу', () => {
    expect(errorsOf({ ...valid, latitude: '69.204411', longitude: '41.275512' })).toEqual([
      'latitude',
      'longitude',
    ])
  })

  it('округляет координаты до шести знаков', () => {
    const value = parseOrThrow({ ...valid, latitude: '41.2755123456' })
    expect(value.latitude).toBe(41.275512)
  })

  it('приводит телефон к одной форме', () => {
    expect(parseOrThrow({ ...valid, contactPhone: '901234567' }).contactPhone).toBe('+998901234567')
    expect(parseOrThrow({ ...valid, contactPhone: '+998 90 123-45-67' }).contactPhone).toBe('+998901234567')
    expect(errorsOf({ ...valid, contactPhone: '12345' })).toEqual(['contactPhone'])
  })

  it('нормализует ник Telegram и хранит его с собакой', () => {
    expect(parseOrThrow({ ...valid, contactTelegram: 'ravon_road' }).contactTelegram).toBe('@ravon_road')
    expect(parseOrThrow({ ...valid, contactTelegram: '@ravon_road' }).contactTelegram).toBe('@ravon_road')
    expect(errorsOf({ ...valid, contactTelegram: 'ab' })).toEqual(['contactTelegram'])
    expect(errorsOf({ ...valid, contactTelegram: 'нет-латиницы' })).toEqual(['contactTelegram'])
  })

  it('обрезает пробелы и считает пустую строку незаполненным полем', () => {
    expect(parseOrThrow({ ...valid, landmark: '  напротив дома 12  ' }).landmark).toBe('напротив дома 12')
    expect(parseOrThrow({ ...valid, landmark: '   ' }).landmark).toBeNull()
  })

  it('отклоняет ориентир длиннее 200 символов', () => {
    expect(errorsOf({ ...valid, landmark: 'я'.repeat(201) })).toEqual(['landmark'])
    expect(parseOrThrow({ ...valid, landmark: 'я'.repeat(200) }).landmark).toHaveLength(200)
  })

  it('видит заполненный honeypot, но не считает его ошибкой', () => {
    const result = parseCreateReport({ ...valid, website: 'http://example.com' })
    expect(result.ok).toBe(true)
    expect(parseOrThrow({ ...valid, website: 'http://example.com' }).honeypotFilled).toBe(true)
  })

  it('подставляет локаль по умолчанию вместо чужого сегмента', () => {
    expect(parseOrThrow({ ...valid, locale: 'ru' }).locale).toBe('ru')
    expect(parseOrThrow({ ...valid, locale: '../../etc' }).locale).toBe('uz')
  })

  it('считает непригодную отметку времени отсутствующей, а не ошибкой', () => {
    // Она кормит флаг «скорость»; терять из-за неё настоящую яму нельзя (PRD §10.3).
    expect(parseOrThrow({ ...valid, formOpenedAt: 'вчера' }).formOpenedAt).toBeNull()
    expect(parseOrThrow({ ...valid, formOpenedAt: '2026-08-10T09:12:44.101Z' }).formOpenedAt).toEqual(
      new Date('2026-08-10T09:12:44.101Z'),
    )
  })
})
