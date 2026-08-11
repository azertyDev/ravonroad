import type { CreateReportResponse } from '@ravonroad/shared-types'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'
import { makeJpeg } from './support/photos'
import { submitReport } from './support/report-request'

const prisma = createTestPrisma()
let app: TestApp
let jpeg: Buffer

/** Поля, которых не должно быть ни в одном ответе. Проверка идёт по тексту ответа,
 *  а не по разобранному объекту: так ловится и вложенность, и переименование
 *  в camelCase, и случайно просочившееся служебное поле (SRS §4, PRD §6.2). */
const NEVER_PUBLIC = [
  'contact_phone',
  'contactPhone',
  'contact_telegram',
  'contactTelegram',
  'created_ip',
  'createdIp',
  'abuse',
  'HONEYPOT',
  'IP_RATE',
  'FAST_FILL',
  'idempotency',
  'duplicate_candidate',
  'duplicateCandidate',
]

const CONTACTS = { contactPhone: '901234567', contactTelegram: 'ravon_road' }

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

describe('Приватность ответов (PRD §6.2, SRS §4)', () => {
  it('не отдаёт контакты, адрес и сигналы в ответе на создание заявки', async () => {
    const response = await submitReport(app, {
      photos: [jpeg],
      fields: { ...CONTACTS, website: 'http://spam.example' },
      headers: { 'X-Forwarded-For': '198.51.100.77' },
    })
    expect(response.status).toBe(201)

    const text = await response.text()
    for (const field of NEVER_PUBLIC) expect(text).not.toContain(field)

    // Контакты и адрес при этом сохранены — они нужны модератору, просто не наружу.
    const report = await prisma.report.findFirstOrThrow()
    expect(report.contactPhone).toBe('+998901234567')
    expect(report.createdIp).toBe('198.51.100.77')
    expect(await prisma.abuseSignal.count()).toBe(1)
  })

  it('отдаёт ровно поля контракта и ни одного лишнего', async () => {
    // Внутренний ключ наружу не выходит вовсе: его появление — дефект,
    // даже если он ничего не открывает (SRS §9.2).
    const response = await submitReport(app, { photos: [jpeg] })
    const body = (await response.json()) as CreateReportResponse

    expect(Object.keys(body).sort()).toEqual([
      'createdAt',
      'displayNumber',
      'districtCode',
      'number',
      'photosPending',
      'status',
      'trackingPath',
      'trackingToken',
    ])
  })

  it('показывает токен владельцу ровно один раз — при создании', async () => {
    // Это единственный ответ, где токен присутствует, и присутствовать он обязан:
    // больше жителю его взять негде (US-012). Во всех публичных ответах его нет.
    const created = await submitReport(app, { photos: [jpeg] })
    const body = (await created.json()) as CreateReportResponse
    expect(body.trackingToken).toHaveLength(22)

    for (const path of ['/api/districts', '/api/categories']) {
      const text = await (await fetch(`${app.baseUrl}${path}`)).text()
      expect(text).not.toContain(body.trackingToken)
      expect(text).not.toContain('tracking')
    }
  })

  it('не отдаёт контакты и токен ни в одном публичном чтении', async () => {
    const created = await submitReport(app, {
      photos: [jpeg],
      fields: { ...CONTACTS },
      headers: { 'X-Forwarded-For': '198.51.100.77' },
    })
    const body = (await created.json()) as CreateReportResponse

    // Каждый публичный маршрут чтения проверяется по тексту ответа целиком:
    // появление любого из этих полей ломает тест, как бы оно ни было названо (SRS §11.3).
    for (const path of [
      '/api/reports',
      '/api/reports/map',
      `/api/reports/${body.number}`,
      '/api/stats',
      '/api/districts',
      '/api/categories',
    ]) {
      const response = await fetch(`${app.baseUrl}${path}`)
      expect(response.status, path).toBe(200)

      const text = await response.text()
      for (const field of NEVER_PUBLIC) expect(text, path).not.toContain(field)
      expect(text, path).not.toContain(body.trackingToken)
      expect(text, path).not.toContain('901234567')
      expect(text, path).not.toContain('ravon_road')
    }
  })

  it('на странице отслеживания отдаёт признак контактов, а не сами контакты', async () => {
    const created = await submitReport(app, { photos: [jpeg], fields: { ...CONTACTS } })
    const body = (await created.json()) as CreateReportResponse

    const response = await fetch(`${app.baseUrl}/api/track/${body.trackingToken}`)
    const text = await response.text()

    // Токен — единственная capability в системе: он даёт кнопку удаления, а не значения
    // (SRS §9.2, §4.5).
    expect(text).toContain('"hasContacts":true')
    expect(text).not.toContain('901234567')
    expect(text).not.toContain('ravon_road')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it('не пишет токен и контакты в тело ошибки', async () => {
    const response = await submitReport(app, {
      photos: [jpeg],
      fields: { ...CONTACTS, latitude: '41.100000', longitude: '69.010000' },
    })
    expect(response.status).toBe(400)

    const text = await response.text()
    expect(text).not.toContain('901234567')
    expect(text).not.toContain('ravon_road')
  })

  it('не выводит токен из номера заявки', async () => {
    // Любая функция от публичного номера превращает его в ключ доступа ко всем
    // заявкам сразу — это и есть IDOR, который раздел §9.2 запрещает прямо.
    const tokens = new Set<string>()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await submitReport(app, { photos: [jpeg] })
      const body = (await response.json()) as CreateReportResponse
      expect(body.trackingToken).not.toContain(String(body.number))
      tokens.add(body.trackingToken)
    }
    expect(tokens.size).toBe(5)
  })
})
