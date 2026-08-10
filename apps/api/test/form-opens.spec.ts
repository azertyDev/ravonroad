import type { ApiErrorBody } from '@ravonroad/shared-types'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'

const prisma = createTestPrisma()
let app: TestApp

async function open(address: string): Promise<Response> {
  return fetch(`${app.baseUrl}/api/form-opens`, {
    method: 'POST',
    headers: { 'X-Forwarded-For': address },
  })
}

beforeAll(async () => {
  app = await startTestApp()
})

beforeEach(async () => {
  await truncateData(prisma)
})

afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})

describe('POST /api/form-opens (SRS §2.13, §4.6)', () => {
  it('отвечает 204 с пустым телом', async () => {
    const response = await open('198.51.100.1')
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('наращивает счётчик суток, а не заводит строку на каждое открытие', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) await open('198.51.100.2')

    const counters = await prisma.formOpenCounter.findMany()
    expect(counters).toHaveLength(1)
    expect(counters[0]?.count).toBe(3)
  })

  it('не заводит ни cookie, ни идентификаторов', async () => {
    // Посуточного числа хватает для конверсии, а всё, что различало бы посетителей,
    // было бы профилированием, запрещённым PRD §9.4.
    const response = await open('198.51.100.3')
    expect(response.headers.get('set-cookie')).toBeNull()

    const counter = await prisma.formOpenCounter.findFirstOrThrow()
    expect(Object.keys(counter)).toEqual(['day', 'count'])
  })

  it('отказывает после шестидесяти открытий в час с адреса', async () => {
    const address = '198.51.100.4'
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      expect((await open(address)).status, `открытие ${attempt}`).toBe(204)
    }

    const refused = await open(address)
    expect(refused.status).toBe(429)
    expect(((await refused.json()) as ApiErrorBody).error.code).toBe('RATE_LIMITED')

    // Отклонённое открытие в счётчик не попадает: метрика измеряет посетителей,
    // а не попытки залить её.
    expect((await prisma.formOpenCounter.findFirstOrThrow()).count).toBe(60)
  })

  it('не тратит лимит открытий на подачу заявок и наоборот', async () => {
    // Счётчик один на процесс, поэтому ключи окон разведены по маршрутам: иначе
    // шестьдесят открытий формы закрыли бы жителю возможность отправить заявку.
    const address = '198.51.100.5'
    for (let attempt = 1; attempt <= 60; attempt += 1) await open(address)
    expect((await open(address)).status).toBe(429)

    const submission = await fetch(`${app.baseUrl}/api/reports`, {
      method: 'POST',
      headers: { 'X-Forwarded-For': address, 'Idempotency-Key': crypto.randomUUID() },
      body: new FormData(),
    })
    // Заявка отклонена по своим причинам — но не лимитом чужого маршрута.
    expect(submission.status).not.toBe(429)
  })
})
