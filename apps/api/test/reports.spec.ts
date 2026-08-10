import type { ApiErrorBody, CreateReportResponse } from '@ravonroad/shared-types'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'
import { makeJpeg } from './support/photos'
import { OUTSIDE_TASHKENT, submitReport } from './support/report-request'

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
  app.storage.requests.length = 0
  app.storage.failing = false
})

afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})

describe('POST /api/reports — принятая заявка (SRS §4.2)', () => {
  it('создаёт заявку, отдаёт номер, токен и ссылку', async () => {
    const response = await submitReport(app, { photos: [jpeg] })
    expect(response.status).toBe(201)

    const body = (await response.json()) as CreateReportResponse
    expect(body.number).toBeGreaterThanOrEqual(3471)
    expect(body.displayNumber).toBe(`RR-${body.number}`)
    expect(body.trackingToken).toHaveLength(22)
    expect(body.trackingPath).toBe(`/uz/z/${body.trackingToken}`)
    // Район считает сервер: значение из клиента не принимается ни в каком виде (US-007).
    expect(body.districtCode).toBe('chilonzor')
    expect(body.status).toBe('NEW')
    // Превью появится позже; заявка уже принята целиком (PRD §8.1).
    expect(body.photosPending).toBe(true)
  })

  it('строит ссылку отслеживания в локали жителя', async () => {
    const response = await submitReport(app, { photos: [jpeg], fields: { locale: 'ru' } })
    const body = (await response.json()) as CreateReportResponse
    expect(body.trackingPath).toBe(`/ru/z/${body.trackingToken}`)
  })

  it('кладёт фотографии в очередь обработки, а не обрабатывает их в запросе', async () => {
    await submitReport(app, { photos: [jpeg, jpeg] })

    const photos = await prisma.reportPhoto.findMany({ orderBy: { sortOrder: 'asc' } })
    expect(photos).toHaveLength(2)
    for (const photo of photos) {
      expect(photo.state).toBe('PENDING')
      expect(photo.kind).toBe('BEFORE')
      expect(photo.rawKey).toMatch(/^incoming\//)
      // Всё, что стоит процессорного времени, происходит после ответа (ADR-0007).
      expect(photo.objectKey).toBeNull()
      expect(photo.sha256).toBeNull()
    }
    expect(photos.map((photo) => photo.sortOrder)).toEqual([0, 1])
    expect(app.storage.objects.size).toBe(2)
  })

  it('пишет первую запись истории с пустым предыдущим статусом', async () => {
    await submitReport(app, { photos: [jpeg] })

    const history = await prisma.reportStatusHistory.findMany()
    expect(history).toHaveLength(1)
    expect(history[0]?.fromStatus).toBeNull()
    expect(history[0]?.toStatus).toBe('NEW')
    expect(history[0]?.actorType).toBe('SYSTEM')
  })

  it('сохраняет ориентир и контакты, приведённые к одной форме', async () => {
    await submitReport(app, {
      photos: [jpeg],
      fields: { landmark: '  напротив дома 12 ', contactPhone: '901234567', contactTelegram: 'ravon_road' },
    })

    const report = await prisma.report.findFirstOrThrow()
    expect(report.landmark).toBe('напротив дома 12')
    expect(report.contactPhone).toBe('+998901234567')
    expect(report.contactTelegram).toBe('@ravon_road')
  })
})

describe('POST /api/reports — геозабор (US-017, AC-3)', () => {
  it('отклоняет точку вне города, не тронув ни БД, ни хранилище', async () => {
    const response = await submitReport(app, { photos: [jpeg], fields: OUTSIDE_TASHKENT })
    expect(response.status).toBe(400)

    const body = (await response.json()) as ApiErrorBody
    expect(body.error.code).toBe('OUTSIDE_TASHKENT')

    expect(await prisma.report.count()).toBe(0)
    // Геозабор стоит до загрузки: заявка вне города не стоит нам ни одного объекта.
    expect(app.storage.objects.size).toBe(0)
    expect(app.storage.requests.filter((request) => request.method === 'PUT')).toHaveLength(0)
  })
})

describe('POST /api/reports — отказы приёма (SRS §4.2, §5.3)', () => {
  it('требует хотя бы одну фотографию', async () => {
    const response = await submitReport(app, { photos: [] })
    expect(response.status).toBe(400)
    expect(((await response.json()) as ApiErrorBody).error.code).toBe('PHOTOS_REQUIRED')
    expect(await prisma.report.count()).toBe(0)
  })

  it('отклоняет файл, который не картинка, даже если он назвался картинкой', async () => {
    const response = await submitReport(app, { photos: [Buffer.from('%PDF-1.7 not a photo')] })
    expect(response.status).toBe(415)
    expect(((await response.json()) as ApiErrorBody).error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    expect(app.storage.objects.size).toBe(0)
  })

  it('требует Idempotency-Key и не принимает мусор вместо него', async () => {
    const missing = await submitReport(app, { photos: [jpeg], idempotencyKey: null })
    expect(missing.status).toBe(400)
    expect(((await missing.json()) as ApiErrorBody).error.code).toBe('VALIDATION_FAILED')

    const garbage = await submitReport(app, { photos: [jpeg], idempotencyKey: 'not-a-uuid' })
    expect(garbage.status).toBe(400)
    expect(await prisma.report.count()).toBe(0)
  })

  it('называет незаполненные поля по именам', async () => {
    const response = await submitReport(app, {
      photos: [jpeg],
      fields: { latitude: '', longitude: '', categoryCode: '' },
    })
    expect(response.status).toBe(400)

    const body = (await response.json()) as ApiErrorBody
    expect(body.error.code).toBe('VALIDATION_FAILED')
    const details = body.error.code === 'VALIDATION_FAILED' ? body.error.details : []
    expect(details.map((detail) => detail.field)).toEqual(['latitude', 'longitude', 'categoryCode'])
  })

  it('отклоняет несуществующую категорию', async () => {
    const response = await submitReport(app, { photos: [jpeg], fields: { categoryCode: 'no_such' } })
    expect(response.status).toBe(400)

    const body = (await response.json()) as ApiErrorBody
    const details = body.error.code === 'VALIDATION_FAILED' ? body.error.details : []
    expect(details).toEqual([{ field: 'categoryCode', code: 'UNKNOWN' }])
  })

  it('отвечает 503 при недоступном хранилище и не оставляет половинчатую заявку', async () => {
    app.storage.failing = true
    const response = await submitReport(app, { photos: [jpeg] })
    expect(response.status).toBe(503)
    expect(((await response.json()) as ApiErrorBody).error.code).toBe('STORAGE_UNAVAILABLE')
    // Клиент сохранит черновик и повторит с тем же ключом — заявка не потеряна (SRS §4.2).
    expect(await prisma.report.count()).toBe(0)
  })

  it('несёт correlationId в теле ошибки и в заголовке', async () => {
    const response = await submitReport(app, { photos: [jpeg], fields: OUTSIDE_TASHKENT })
    const body = (await response.json()) as ApiErrorBody
    expect(body.error.correlationId).toHaveLength(26)
    expect(response.headers.get('x-request-id')).toBe(body.error.correlationId)
  })
})
