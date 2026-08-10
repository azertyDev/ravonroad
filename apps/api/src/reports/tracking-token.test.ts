import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateTrackingToken, TRACKING_TOKEN_LENGTH } from './tracking-token'

const BASE64URL = /^[A-Za-z0-9_-]+$/

describe('generateTrackingToken (SRS §2.3)', () => {
  it('даёт 22 символа алфавита base64url', () => {
    for (let i = 0; i < 1000; i += 1) {
      const token = generateTrackingToken()
      expect(token).toHaveLength(TRACKING_TOKEN_LENGTH)
      expect(token).toMatch(BASE64URL)
    }
  })

  it('не повторяется на миллионе выборок', () => {
    // Миллион — не украшение: на нём заметно вырождение источника, которого
    // на тысяче ещё не видно. Проверка ловит подмену CSPRNG на счётчик или на время.
    const seen = new Set<string>()
    for (let i = 0; i < 1_000_000; i += 1) seen.add(generateTrackingToken())
    expect(seen.size).toBe(1_000_000)
  })

  it('не содержит Math.random в исходнике', () => {
    // Проверка на текст, а не на поведение: подмену источника на предсказуемый
    // статистически не поймать, а прочитать — можно. Комментарии вырезаются: запрет
    // на Math.random сформулирован в самом файле, и упоминание запрета — не нарушение.
    // Путь от корня пакета, а не от import.meta: apps/api собирается в CommonJS,
    // где import.meta недоступен. Опечатка в пути уронит readFileSync, а не пройдёт молча.
    const source = readFileSync(resolve(process.cwd(), 'src/reports/tracking-token.ts'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).toContain('randomBytes')
    expect(code).not.toContain('Math.random')
  })
})
