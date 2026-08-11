import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runWithCorrelationId } from './correlation'
import { ipPrefix, logEvent } from './logger'

function capture(operation: () => void): Record<string, unknown>[] {
  const lines: string[] = []
  const out = vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
  const err = vi.spyOn(console, 'error').mockImplementation((line: string) => void lines.push(line))
  try {
    operation()
  } finally {
    out.mockRestore()
    err.mockRestore()
  }
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('форма строки лога (SRS §8.4)', () => {
  it('пишет один объект на строку с обязательными полями', () => {
    const [line] = capture(() => {
      runWithCorrelationId('01J9F7K2W8N4Q3ABCDEFGHJKMN', () => {
        logEvent('info', 'report_created', { reportId: 7 })
      })
    })
    expect(line).toMatchObject({
      level: 'info',
      msg: 'report_created',
      correlationId: '01J9F7K2W8N4Q3ABCDEFGHJKMN',
      reportId: 7,
    })
    expect(typeof line?.['ts']).toBe('string')
  })

  it('вне запроса correlationId пуст, а не выдуман', () => {
    const [line] = capture(() => logEvent('info', 'queue_depth', { photoQueue: 0 }))
    expect(line?.['correlationId']).toBeNull()
  })

  it('пропускает незаданные поля, а не пишет их как null', () => {
    const [line] = capture(() => logEvent('warn', 'photo_rejected', { reportId: undefined }))
    expect(line).not.toHaveProperty('reportId')
  })
})

describe('запретный список (SRS §8.4)', () => {
  it('обрезает полный адрес до /24 в свободном тексте', () => {
    const [line] = capture(() => logEvent('warn', 'outbox_send_failed', { error: 'connect 84.54.66.129 refused' }))
    expect(line?.['error']).toBe('connect 84.54.66.0/24 refused')
    expect(JSON.stringify(line)).not.toContain('84.54.66.129')
  })

  it('прячет телефон в свободном тексте', () => {
    const [line] = capture(() => logEvent('error', 'after_photo_failed', { error: 'contact +998901234567 failed' }))
    expect(line?.['error']).toBe('contact +*** failed')
  })

  it('ipPrefix отдаёт только сеть /24', () => {
    expect(ipPrefix('84.54.66.129')).toBe('84.54.66.0/24')
    expect(ipPrefix(null)).toBeUndefined()
    // За CGNAT адрес приходит и в IPv6; сети /24 у него нет, и выдумывать её нельзя.
    expect(ipPrefix('2001:db8::1')).toBeUndefined()
  })
})

function sources(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'generated') files.push(...sources(path))
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      files.push(path)
    }
  }
  return files
}

// Vitest запускается из apps/api — тот же корень, что у `pnpm --filter api test`.
const SRC = join(process.cwd(), 'src')

/** Двенадцать обязательных событий SRS §10.2. Список закрыт: не «желательно бы логировать»,
 *  а «без этого поломка не видна». Тест держит его от тихого выпадения при рефакторинге —
 *  пропавшее событие иначе обнаруживается в тот день, когда оно понадобилось. */
describe('обязательные события SRS §10.2 присутствуют в коде', () => {
  const REQUIRED = [
    'report_created',
    'report_rejected_geofence',
    'report_rate_flagged',
    'status_changed',
    'status_undone',
    'unauthorized_button_press',
    'webhook_auth_failed',
    'photo_rejected',
    'outbox_send_failed',
    'telegram_unavailable',
    'contacts_deleted',
    'db_unavailable',
  ]

  it.each(REQUIRED)('%s пишется где-то в apps/api/src', (event) => {
    const written = sources(SRC).some((file) => readFileSync(file, 'utf8').includes(`'${event}'`))
    expect(written).toBe(true)
  })
})

/** Тип `LogFields` закрыт, поэтому запретное поле не проходит `pnpm typecheck`. Этот тест
 *  ловит второй способ пронести его в лог — под разрешённым именем: `reason: token`,
 *  `error: report.contactPhone`. Он читает исходники, а не гоняет код, потому что
 *  проверяет форму **новой строки лога**, а не поведение уже написанной (AC-2). */
describe('ни одна строка лога в коде не берёт запретное значение', () => {
  const FORBIDDEN = [
    'trackingToken',
    'tracking_token',
    'contactPhone',
    'contactTelegram',
    'contact_phone',
    'contact_telegram',
    'createdIp',
    'created_ip',
    'clientIp',
    'request.url',
    'req.url',
    'buffer',
  ]

  /** Аргументы вызова целиком: от `logEvent(` до парной скобки, со вложенными скобками
   *  и шаблонными строками внутри. */
  function calls(source: string): string[] {
    const found: string[] = []
    for (let at = source.indexOf('logEvent('); at !== -1; at = source.indexOf('logEvent(', at + 1)) {
      let depth = 0
      for (let cursor = at + 'logEvent'.length; cursor < source.length; cursor += 1) {
        const char = source[cursor]
        if (char === '(') depth += 1
        else if (char === ')') {
          depth -= 1
          if (depth === 0) {
            found.push(source.slice(at, cursor + 1))
            break
          }
        }
      }
    }
    return found
  }

  it('проверяет каждую строку лога в apps/api/src', () => {
    const offences: string[] = []
    let checked = 0
    for (const file of sources(SRC)) {
      for (const call of calls(readFileSync(file, 'utf8'))) {
        checked += 1
        for (const forbidden of FORBIDDEN) {
          if (call.includes(forbidden)) offences.push(`${file}: ${forbidden} в ${call}`)
        }
      }
    }
    // Ноль найденных вызовов означал бы, что тест проверил пустоту и был бы зелёным
    // ровно до тех пор, пока кто-нибудь не переименует logEvent.
    expect(checked).toBeGreaterThan(10)
    expect(offences).toEqual([])
  })
})
