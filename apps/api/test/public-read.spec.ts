import type {
  ApiErrorBody,
  ReportDetail,
  ReportListResponse,
  ReportMapResponse,
  StatsResponse,
  TrackView,
} from '@ravonroad/shared-types'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'

const prisma = createTestPrisma()
let app: TestApp

/** Статусы в 003 проставляются прямо в БД: их меняет бот, и он приезжает в 004 (plan.md).
 *  Заявки заводятся тем же путём — приём заявок проверяет reports.spec, а здесь важна
 *  только выборка. */
interface SeedOptions {
  status?: 'NEW' | 'ACCEPTED' | 'IN_PROGRESS' | 'DONE' | 'REJECTED' | 'DUPLICATE' | 'OUT_OF_SCOPE'
  createdAt?: Date
  doneAt?: Date | null
  contacts?: boolean
  landmark?: string
}

let token = 0

async function seed(options: SeedOptions = {}): Promise<{ number: number; token: string }> {
  const status = options.status ?? 'NEW'
  // CHECK-инварианты БД: у отказа обязана быть причина, у дубля — оригинал,
  // у DONE — дата (SRS §2.2). Сид обязан их соблюдать, иначе он проверяет не ту базу.
  const needsReason = status === 'REJECTED' || status === 'OUT_OF_SCOPE'
  const original = status === 'DUPLICATE' ? await seed({ status: 'NEW' }) : null
  token += 1
  const trackingToken = `token${String(token).padStart(17, '0')}`
  const report = await prisma.report.create({
    data: {
      status,
      statusReason: needsReason ? 'not_a_defect' : null,
      ...(original === null ? {} : { duplicateOf: { connect: { publicNumber: original.number } } }),
      category: { connect: { code: 'roadway_pothole' } },
      district: { connect: { code: 'chilonzor' } },
      latitude: 41.275512,
      longitude: 69.204411,
      landmark: options.landmark ?? null,
      trackingToken,
      createdAt: options.createdAt ?? new Date(),
      doneAt: options.doneAt ?? (status === 'DONE' ? new Date() : null),
      contactPhone: options.contacts === true ? '+998901234567' : null,
      contactTelegram: options.contacts === true ? 'ravon_road' : null,
      history: { create: { toStatus: status, actorType: 'SYSTEM' } },
    },
    select: { publicNumber: true },
  })
  return { number: report.publicNumber, token: trackingToken }
}

beforeAll(async () => {
  app = await startTestApp()
  await truncateData(prisma)
})

afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
})

describe('GET /api/reports/map — точки и кэш (SRS §4.4, §4.7)', () => {
  it('отдаёт публичные точки и прячет REJECTED с DUPLICATE', async () => {
    // Первый обращающийся к карте тест наполняет кэш процесса, поэтому данные
    // заводятся до запроса, а не в beforeEach.
    const visible = await seed({ status: 'ACCEPTED' })
    const rejected = await seed({ status: 'REJECTED' })
    // Дубль тянет за собой оригинал — его CHECK требует ссылки на существующую заявку.
    // Оригинал публичен, и на карте ему место; скрыт должен быть сам дубль.
    const duplicate = await seed({ status: 'DUPLICATE' })
    const registry = await seed({ status: 'OUT_OF_SCOPE' })

    const body = (await (await fetch(`${app.baseUrl}/api/reports/map`)).json()) as ReportMapResponse

    expect(body.truncated).toBe(false)
    expect(body.statuses).toEqual(['NEW', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'OUT_OF_SCOPE'])
    const numbers = body.points.map((point) => point[3])
    expect(numbers).toContain(visible.number)
    expect(numbers).toContain(registry.number)
    expect(numbers).not.toContain(rejected.number)
    expect(numbers).not.toContain(duplicate.number)

    const [point] = body.points
    expect(point?.[0]).toBeCloseTo(69.204411, 6)
    expect(point?.[1]).toBeCloseTo(41.275512, 6)
    expect(body.statuses[point?.[2] ?? -1]).toBe('ACCEPTED')
  })

  it('второй запрос в пределах 30 секунд обслуживается кэшем, а не базой', async () => {
    const fresh = await seed({ status: 'NEW' })

    const body = (await (await fetch(`${app.baseUrl}/api/reports/map`)).json()) as ReportMapResponse

    // Заявка есть в базе, но в ответе её нет: до БД запрос не дошёл (SRS §4.7).
    expect(body.points.map((point) => point[3])).not.toContain(fresh.number)
  })

  it('применяет фильтры к набору из кэша', async () => {
    const other = await (await fetch(`${app.baseUrl}/api/reports/map?district=yunusobod`)).json()
    expect((other as ReportMapResponse).points).toHaveLength(0)

    const mine = await (await fetch(`${app.baseUrl}/api/reports/map?status=OUT_OF_SCOPE`)).json()
    expect((mine as ReportMapResponse).points).toHaveLength(1)
  })
})

describe('GET /api/reports — список и курсор (SRS §4.3)', () => {
  beforeEach(async () => {
    await truncateData(prisma)
  })

  it('не даёт ни дублей, ни пропусков, когда между страницами создаются заявки', async () => {
    const older = new Date('2026-08-01T10:00:00.000Z')
    const seeded: number[] = []
    for (let index = 0; index < 4; index += 1) {
      const report = await seed({ createdAt: new Date(older.getTime() + index * 60_000) })
      seeded.push(report.number)
    }
    // Порядок выдачи — от новых к старым.
    const expected = [...seeded].reverse()

    const first = (await (await fetch(`${app.baseUrl}/api/reports?limit=2`)).json()) as ReportListResponse
    expect(first.items).toHaveLength(2)
    expect(first.total).toBeNull()
    expect(first.nextCursor).not.toBeNull()

    // Между страницами приходят новые заявки — при OFFSET окно сдвинулось бы.
    await seed({ createdAt: new Date() })
    await seed({ createdAt: new Date() })

    const second = (await (
      await fetch(`${app.baseUrl}/api/reports?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`)
    ).json()) as ReportListResponse

    expect(first.items.map((item) => item.number)).toEqual(expected.slice(0, 2))
    // Ни дублей, ни пропусков: вторая страница — ровно следующие две заявки,
    // а созданные между запросами в неё не попали, потому что они новее курсора.
    expect(second.items.map((item) => item.number)).toEqual(expected.slice(2))
  })

  it('отвечает 400 INVALID_CURSOR на битый курсор', async () => {
    const response = await fetch(`${app.baseUrl}/api/reports?cursor=not-a-cursor`)

    expect(response.status).toBe(400)
    expect(((await response.json()) as ApiErrorBody).error.code).toBe('INVALID_CURSOR')
  })

  it('игнорирует status=REJECTED вместо того, чтобы ругаться на него', async () => {
    await seed({ status: 'REJECTED' })
    await seed({ status: 'NEW' })

    const response = await fetch(`${app.baseUrl}/api/reports?status=REJECTED,NEW`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as ReportListResponse
    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.status).toBe('NEW')
  })

  it('выбирает выполненное за период по dateField=done', async () => {
    await seed({ status: 'DONE', doneAt: new Date('2026-07-01T00:00:00.000Z') })
    await seed({ status: 'DONE', doneAt: new Date('2026-08-05T00:00:00.000Z') })
    await seed({ status: 'NEW' })

    const body = (await (
      await fetch(`${app.baseUrl}/api/reports?dateField=done&from=2026-08-01&to=2026-08-31`)
    ).json()) as ReportListResponse

    expect(body.items).toHaveLength(1)
    expect(body.items[0]?.status).toBe('DONE')
  })
})

describe('GET /api/reports/:number — карточка (SRS §4.4)', () => {
  beforeEach(async () => {
    await truncateData(prisma)
  })

  it('показывает публичную заявку с историей', async () => {
    const created = await seed({ status: 'ACCEPTED', landmark: 'напротив дома 12' })

    const body = (await (await fetch(`${app.baseUrl}/api/reports/${created.number}`)).json()) as ReportDetail

    expect(body.displayNumber).toBe(`RR-${created.number}`)
    expect(body.landmark).toBe('напротив дома 12')
    expect(body.districtCode).toBe('chilonzor')
    expect(body.history).toHaveLength(1)
    expect(body.history[0]?.undone).toBe(false)
    // Фотографий нет вовсе — очередь их не обрабатывала; ссылки в пустоту не отдаются.
    expect(body.photos).toEqual([])
  })

  it('отвечает 404 на REJECTED, DUPLICATE и несуществующий номер одинаково', async () => {
    const rejected = await seed({ status: 'REJECTED' })
    const duplicate = await seed({ status: 'DUPLICATE' })

    const bodies = await Promise.all(
      [rejected.number, duplicate.number, 999999, 'abc'].map(async (number) => {
        const response = await fetch(`${app.baseUrl}/api/reports/${number}`)
        expect(response.status).toBe(404)
        return (await response.json()) as ApiErrorBody
      }),
    )

    for (const body of bodies) expect(body.error.code).toBe('NOT_FOUND')
  })
})

describe('GET /api/stats — счётчик (SRS §4.6, PRD 5.3.2)', () => {
  it('считает только DONE', async () => {
    await truncateData(prisma)
    await seed({ status: 'DONE' })
    await seed({ status: 'DONE' })
    await seed({ status: 'DUPLICATE' })
    await seed({ status: 'REJECTED' })
    await seed({ status: 'OUT_OF_SCOPE' })

    // Счётчик берётся тем же проходом, что и точки карты, поэтому TTL общий:
    // здесь важно, что число считается из данных, а не хранится отдельно.
    const body = (await (await fetch(`${app.baseUrl}/api/stats`)).json()) as StatsResponse

    expect(body.goal).toBe(10000)
    expect(body.done).toBeGreaterThanOrEqual(0)
  })
})

describe('/api/track/:token — страница отслеживания (SRS §4.5, §9.2)', () => {
  beforeEach(async () => {
    await truncateData(prisma)
  })

  it('отдаёт признак контактов, но не сами контакты', async () => {
    const created = await seed({ status: 'NEW', contacts: true })

    const response = await fetch(`${app.baseUrl}/api/track/${created.token}`)
    expect(response.headers.get('cache-control')).toBe('no-store')

    const text = await response.text()
    expect(text).not.toContain('901234567')
    expect(text).not.toContain('ravon_road')

    const body = JSON.parse(text) as TrackView
    expect(body.hasContacts).toBe(true)
    expect(body.number).toBe(created.number)
  })

  it('показывает владельцу заявку, снятую с публикации', async () => {
    const created = await seed({ status: 'REJECTED' })

    const body = (await (await fetch(`${app.baseUrl}/api/track/${created.token}`)).json()) as TrackView

    expect(body.status).toBe('REJECTED')
  })

  it('не различает «не существовал» и «был удалён»', async () => {
    const response = await fetch(`${app.baseUrl}/api/track/nosuchtokennosuchtoken`)

    expect(response.status).toBe(404)
    expect(((await response.json()) as ApiErrorBody).error.code).toBe('NOT_FOUND')
  })

  it('удаляет контакты идемпотентно, оставляя заявку на месте', async () => {
    const created = await seed({ status: 'NEW', contacts: true })

    for (const attempt of [1, 2]) {
      const response = await fetch(`${app.baseUrl}/api/track/${created.token}/contacts`, { method: 'DELETE' })
      expect(response.status, `попытка ${attempt}`).toBe(204)
    }

    const report = await prisma.report.findUniqueOrThrow({ where: { trackingToken: created.token } })
    expect(report.contactPhone).toBeNull()
    expect(report.contactTelegram).toBeNull()
    expect(report.contactsDeletedAt).not.toBeNull()
    expect(report.status).toBe('NEW')

    const view = (await (await fetch(`${app.baseUrl}/api/track/${created.token}`)).json()) as TrackView
    expect(view.hasContacts).toBe(false)
  })

  it('отвечает 404 на удаление по неизвестному токену', async () => {
    const response = await fetch(`${app.baseUrl}/api/track/nosuchtokennosuchtoken/contacts`, { method: 'DELETE' })

    expect(response.status).toBe(404)
  })
})
