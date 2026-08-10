import { DEFAULT_LOCALE, isLocale, LANDMARK_MAX_LENGTH, type FieldError, type Locale } from '@ravonroad/shared-types'

/** Разбор нефайловых частей `multipart/form-data` (SRS §4.2).
 *
 *  Всё приходит строками, и всё приходит из браузера, поэтому разбирается и проверяется
 *  здесь — на границе доверия. Дальше по коду значения уже имеют типы, и ни один сервис
 *  не гадает, что означает `latitude`.
 *
 *  Проверка **не** решает, попала ли точка в город: грубые границы ловят перепутанные
 *  местами широту и долготу, а настоящий геозабор — это запрос к полигонам (SRS §3.3). */

const LATITUDE_RANGE = { min: 41.0, max: 41.6 }
const LONGITUDE_RANGE = { min: 69.0, max: 69.7 }

/** 6 знаков ≈ 11 см. Больше не хранится: у пина такой точности нет и быть не может. */
const COORDINATE_PRECISION = 6

const PHONE_DIGITS = /^\d{9}$/
const PHONE_FULL = /^\+998\d{9}$/
const TELEGRAM = /^[A-Za-z0-9_]{5,32}$/

export interface CreateReportInput {
  latitude: number
  longitude: number
  categoryCode: string
  landmark: string | null
  contactPhone: string | null
  contactTelegram: string | null
  locale: Locale
  /** Honeypot: заполнено — заявка создаётся и получает сигнал (PRD §10.2). */
  honeypotFilled: boolean
  formOpenedAt: Date | null
}

export type ParseResult = { ok: true; value: CreateReportInput } | { ok: false; errors: FieldError[] }

function asString(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

function round(value: number): number {
  return Number(value.toFixed(COORDINATE_PRECISION))
}

function parseCoordinate(
  raw: unknown,
  field: string,
  range: { min: number; max: number },
  errors: FieldError[],
): number {
  const text = asString(raw)
  if (text === null) {
    errors.push({ field, code: 'REQUIRED' })
    return 0
  }
  const value = Number(text)
  if (!Number.isFinite(value)) {
    errors.push({ field, code: 'NOT_A_NUMBER' })
    return 0
  }
  if (value < range.min || value > range.max) {
    errors.push({ field, code: 'OUT_OF_RANGE' })
    return 0
  }
  return round(value)
}

/** `+998901234567` и `901234567` — одно и то же число, записанное так, как житель привык.
 *  Приводится к одной форме здесь, чтобы модератор не гадал, звонить ли через плюс. */
function parsePhone(raw: unknown, errors: FieldError[]): string | null {
  const text = asString(raw)
  if (text === null) return null
  const compact = text.replace(/[\s()-]/g, '')
  if (PHONE_FULL.test(compact)) return compact
  if (PHONE_DIGITS.test(compact)) return `+998${compact}`
  errors.push({ field: 'contactPhone', code: 'INVALID_FORMAT' })
  return null
}

function parseTelegram(raw: unknown, errors: FieldError[]): string | null {
  const text = asString(raw)
  if (text === null) return null
  const handle = text.startsWith('@') ? text.slice(1) : text
  if (!TELEGRAM.test(handle)) {
    errors.push({ field: 'contactTelegram', code: 'INVALID_FORMAT' })
    return null
  }
  // Хранится с собакой: модератор копирует значение прямо в поиск Telegram.
  return `@${handle}`
}

export function parseCreateReport(raw: Record<string, unknown>): ParseResult {
  const errors: FieldError[] = []

  const latitude = parseCoordinate(raw['latitude'], 'latitude', LATITUDE_RANGE, errors)
  const longitude = parseCoordinate(raw['longitude'], 'longitude', LONGITUDE_RANGE, errors)

  const categoryCode = asString(raw['categoryCode'])
  if (categoryCode === null) errors.push({ field: 'categoryCode', code: 'REQUIRED' })

  const landmark = asString(raw['landmark'])
  if (landmark !== null && landmark.length > LANDMARK_MAX_LENGTH) {
    errors.push({ field: 'landmark', code: 'TOO_LONG' })
  }

  const contactPhone = parsePhone(raw['contactPhone'], errors)
  const contactTelegram = parseTelegram(raw['contactTelegram'], errors)

  const localeRaw = asString(raw['locale'])
  // Локаль приходит из адресной строки и участвует в ссылке, которую житель откроет;
  // чужое значение молча заменяется на локаль по умолчанию, а не роняет отправку.
  const locale = localeRaw !== null && isLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE

  const openedRaw = asString(raw['formOpenedAt'])
  const opened = openedRaw === null ? null : new Date(openedRaw)
  // Непригодная отметка времени — это отсутствие отметки, а не отказ: она кормит флаг
  // антиабуза, и терять из-за неё настоящую яму нельзя (PRD §10.3).
  const formOpenedAt = opened !== null && !Number.isNaN(opened.getTime()) ? opened : null

  if (errors.length > 0 || categoryCode === null) return { ok: false, errors }

  return {
    ok: true,
    value: {
      latitude,
      longitude,
      categoryCode,
      landmark,
      contactPhone,
      contactTelegram,
      locale,
      honeypotFilled: asString(raw['website']) !== null,
      formOpenedAt,
    },
  }
}
