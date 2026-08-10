import type { ApiErrorBody, CreateReportResponse } from '@ravonroad/shared-types'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'
import { makeJpeg } from './support/photos'
import { submitReport } from './support/report-request'

const prisma = createTestPrisma()
let app: TestApp
let jpeg: Buffer

/** Один и тот же адрес на весь файл: лимиты считаются по нему, и подмешивать
 *  сюда настоящий адрес петли значило бы получить разный результат на разных машинах. */
function fromAddress(address: string): Record<string, string> {
  return { 'X-Forwarded-For': address }
}

beforeAll(async () => {
  app = await startTestApp()
  jpeg = await makeJpeg()
})

beforeEach(async () => {
  await truncateData(prisma)
})

afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})

describe('Антиабуз ничего не блокирует, кроме геозабора (PRD §10)', () => {
  it('заполненный honeypot создаёт заявку и ставит флаг', async () => {
    const response = await submitReport(app, {
      photos: [jpeg],
      fields: { website: 'http://example.com' },
      headers: fromAddress('203.0.113.10'),
    })
    // Менеджеры паролей и автозаполнение дают ложные срабатывания, а цена ложного
    // отказа — потерянная настоящая яма (PRD §10.2).
    expect(response.status).toBe(201)

    const signals = await prisma.abuseSignal.findMany()
    expect(signals.map((signal) => signal.rule)).toEqual(['HONEYPOT'])
    expect(await prisma.report.count()).toBe(1)
  })

  it('отправка быстрее пяти секунд с тремя фото даёт FAST_FILL', async () => {
    const response = await submitReport(app, {
      photos: [jpeg, jpeg, jpeg],
      fields: { formOpenedAt: new Date().toISOString() },
      headers: fromAddress('203.0.113.11'),
    })
    expect(response.status).toBe(201)

    const signals = await prisma.abuseSignal.findMany()
    expect(signals.map((signal) => signal.rule)).toEqual(['FAST_FILL'])
    expect(signals[0]?.detail).toMatchObject({ fillMs: expect.any(Number) })
  })

  it('не считает быстрой отправку одной фотографии', async () => {
    // Одну фотографию человек прикладывает за секунды; правило смотрит на три
    // именно потому, что три за пять секунд недостижимы (PRD §10.3).
    await submitReport(app, {
      photos: [jpeg],
      fields: { formOpenedAt: new Date().toISOString() },
      headers: fromAddress('203.0.113.12'),
    })
    expect(await prisma.abuseSignal.count()).toBe(0)
  })

  it('одиннадцатая заявка за час с адреса создаётся и получает IP_RATE', async () => {
    const address = fromAddress('203.0.113.13')
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await submitReport(app, { photos: [jpeg], headers: address })
      expect(response.status, `заявка ${attempt}`).toBe(201)
    }
    expect(await prisma.abuseSignal.count()).toBe(0)

    const eleventh = await submitReport(app, { photos: [jpeg], headers: address })
    expect(eleventh.status).toBe(201)

    const signals = await prisma.abuseSignal.findMany({ where: { rule: 'IP_RATE' } })
    expect(signals).toHaveLength(1)
    expect(signals[0]?.detail).toEqual({ perHour: 11 })
    expect(await prisma.report.count()).toBe(11)
  })

  it('шестьдесят первая заявка за час получает 429 с Retry-After', async () => {
    // Единственный жёсткий порог по адресу, и он про исчерпание ресурса: за CGNAT
    // 60 заявок в час от разных людей — это 20 заявок в неделю от одного дома (SRS §9.5).
    const address = fromAddress('203.0.113.14')
    for (let attempt = 1; attempt <= 60; attempt += 1) {
      await submitReport(app, { photos: [jpeg], headers: address })
    }

    const refused = await submitReport(app, { photos: [jpeg], headers: address })
    expect(refused.status).toBe(429)
    expect(((await refused.json()) as ApiErrorBody).error.code).toBe('RATE_LIMITED')
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await prisma.report.count()).toBe(60)
  })

  it('считает лимит по каждому адресу отдельно', async () => {
    for (let attempt = 1; attempt <= 11; attempt += 1) {
      await submitReport(app, { photos: [jpeg], headers: fromAddress('203.0.113.15') })
    }
    const other = await submitReport(app, { photos: [jpeg], headers: fromAddress('203.0.113.16') })
    expect(other.status).toBe(201)

    const flagged = await prisma.abuseSignal.findMany({ where: { rule: 'IP_RATE' } })
    expect(flagged).toHaveLength(1)
  })

  it('не тратит лимит адреса на повторы с тем же ключом', async () => {
    // Иначе плохая сеть наказывала бы жителя за то, что он нажал «повторить».
    const address = fromAddress('203.0.113.17')
    const idempotencyKey = '11111111-2222-4333-8444-555555555555'
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await submitReport(app, { photos: [jpeg], idempotencyKey, headers: address })
    }

    const fresh = await submitReport(app, { photos: [jpeg], headers: address })
    const body = (await fresh.json()) as CreateReportResponse
    expect(fresh.status).toBe(201)
    expect(body.number).toBeGreaterThan(0)
    expect(await prisma.abuseSignal.count()).toBe(0)
  })
})
