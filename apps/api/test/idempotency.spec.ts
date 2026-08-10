import { randomUUID } from 'node:crypto'
import type { ApiErrorBody, CreateReportResponse } from '@ravonroad/shared-types'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'
import { makeJpeg } from './support/photos'
import { submitReport } from './support/report-request'

const prisma = createTestPrisma()
let app: TestApp
let jpeg: Buffer

beforeAll(async () => {
  app = await startTestApp()
  jpeg = await makeJpeg()
})

beforeEach(async () => {
  await truncateData(prisma)
  app.storage.objects.clear()
})

afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})

describe('Idempotency-Key (US-016, SRS §4.2)', () => {
  it('три нажатия «повторить» подряд дают одну заявку', async () => {
    const idempotencyKey = randomUUID()

    const first = await submitReport(app, { photos: [jpeg], idempotencyKey })
    expect(first.status).toBe(201)
    const created = (await first.json()) as CreateReportResponse

    for (const attempt of [2, 3]) {
      const repeat = await submitReport(app, { photos: [jpeg], idempotencyKey })
      // 200, а не 201: в этот раз заявка не создавалась.
      expect(repeat.status, `попытка ${attempt}`).toBe(200)
      const body = (await repeat.json()) as CreateReportResponse
      expect(body).toEqual(created)
    }

    expect(await prisma.report.count()).toBe(1)
  })

  it('не загружает фотографии заново при повторе', async () => {
    // Житель у ямы платит за мобильный трафик; вторая отправка тех же трёх файлов
    // стоила бы ему денег, а нам — лишних объектов в бакете.
    const idempotencyKey = randomUUID()
    await submitReport(app, { photos: [jpeg, jpeg], idempotencyKey })
    expect(app.storage.objects.size).toBe(2)

    await submitReport(app, { photos: [jpeg, jpeg], idempotencyKey })
    expect(app.storage.objects.size).toBe(2)
    expect(await prisma.reportPhoto.count()).toBe(2)
  })

  it('отвечает 409 на тот же ключ с другим содержимым', async () => {
    const idempotencyKey = randomUUID()
    await submitReport(app, { photos: [jpeg], idempotencyKey })

    const conflicting = await submitReport(app, {
      photos: [jpeg],
      idempotencyKey,
      fields: { latitude: '41.311081', longitude: '69.240562' },
    })
    expect(conflicting.status).toBe(409)
    expect(((await conflicting.json()) as ApiErrorBody).error.code).toBe('IDEMPOTENCY_CONFLICT')
    // Молча вернуть чужую заявку было бы хуже отказа: житель увидел бы номер,
    // к которому его фотографии не имеют отношения.
    expect(await prisma.report.count()).toBe(1)
  })

  it('видит другой контакт как другое содержимое', async () => {
    const idempotencyKey = randomUUID()
    await submitReport(app, { photos: [jpeg], idempotencyKey })

    const conflicting = await submitReport(app, {
      photos: [jpeg],
      idempotencyKey,
      fields: { contactPhone: '901234567' },
    })
    expect(conflicting.status).toBe(409)
  })

  it('даёт разным ключам разные заявки', async () => {
    await submitReport(app, { photos: [jpeg] })
    await submitReport(app, { photos: [jpeg] })
    expect(await prisma.report.count()).toBe(2)
  })

  it('создаёт одну заявку, когда три «повторить» ушли одновременно', async () => {
    // Плохая сеть даёт именно это: житель жмёт кнопку, ничего не происходит, он жмёт ещё.
    // Проверка на SELECT здесь не спасает — спасает уникальный индекс.
    const idempotencyKey = randomUUID()
    const responses = await Promise.all(
      [1, 2, 3].map(() => submitReport(app, { photos: [jpeg], idempotencyKey })),
    )

    expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 201])
    const bodies = (await Promise.all(responses.map((response) => response.json()))) as CreateReportResponse[]
    expect(new Set(bodies.map((body) => body.number)).size).toBe(1)
    expect(await prisma.report.count()).toBe(1)
  })
})
