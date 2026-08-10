import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import { generateRequestId, normalizeRequestId, requestIdMiddleware } from './request-id.middleware'

const VALID = '01J9F7K2W8N4Q3ABCDEFGHJKMN'

function run(incoming: string | string[] | undefined): { header: string; forwarded: unknown } {
  const req = { headers: incoming === undefined ? {} : { 'x-request-id': incoming } } as IncomingMessage
  let header = ''
  const res = { setHeader: (_name: string, value: string) => { header = value } } as unknown as ServerResponse
  let called = false
  requestIdMiddleware(req, res, () => { called = true })
  expect(called).toBe(true)
  return { header, forwarded: req.headers['x-request-id'] }
}

describe('generateRequestId', () => {
  it('даёт 26 символов алфавита Крокфорда', () => {
    expect(generateRequestId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('монотонен по времени', () => {
    const earlier = generateRequestId(1_770_000_000_000)
    const later = generateRequestId(1_770_000_000_001)
    expect(later.slice(0, 10) > earlier.slice(0, 10)).toBe(true)
  })

  it('не повторяется', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateRequestId()))
    expect(ids.size).toBe(1000)
  })
})

describe('normalizeRequestId', () => {
  it('сохраняет присланный клиентом идентификатор', () => {
    expect(normalizeRequestId(VALID)).toBe(VALID)
  })

  it('отвергает мусор и выдаёт свой', () => {
    for (const bad of ['', 'short', `${VALID}X`, 'ILOU'.repeat(7).slice(0, 26), '../../etc/passwd', 'a\nSet-Cookie: x=1']) {
      expect(normalizeRequestId(bad)).not.toBe(bad)
      expect(normalizeRequestId(bad)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    }
  })
})

describe('requestIdMiddleware', () => {
  it('ставит заголовок в ответ и на каждый запрос', () => {
    const generated = run(undefined)
    expect(generated.header).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(generated.forwarded).toBe(generated.header)
  })

  it('пробрасывает присланный идентификатор', () => {
    expect(run(VALID).header).toBe(VALID)
  })

  it('берёт первый из повторяющихся заголовков', () => {
    expect(run([VALID, 'nonsense']).header).toBe(VALID)
  })
})
