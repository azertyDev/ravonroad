import { randomBytes } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { DuplicatesService } from '../src/geo/duplicates.service'
import type { ReportStatus } from '../src/generated/prisma/enums'
import { createTestPrisma, truncateData } from './support/database'

const prisma = createTestPrisma()
const duplicates = new DuplicatesService(prisma)

/** Чиланзар, произвольная точка внутри города: конкретные координаты роли не играют,
 *  важны расстояния между ними. */
const ORIGIN = { latitude: 41.275512, longitude: 69.204411 }
/** 0,00027° широты ≈ 30 м, 0,0027° ≈ 300 м. */
const NEAR = { latitude: ORIGIN.latitude + 0.00027, longitude: ORIGIN.longitude }
const FAR = { latitude: ORIGIN.latitude + 0.0027, longitude: ORIGIN.longitude }

let categoryId = 0

async function createReport(
  point: { latitude: number; longitude: number },
  options: { status?: ReportStatus; statusReason?: string; candidateOfId?: number; createdAt?: Date } = {},
): Promise<number> {
  const report = await prisma.report.create({
    data: {
      categoryId,
      districtCode: 'chilonzor',
      latitude: point.latitude,
      longitude: point.longitude,
      trackingToken: randomBytes(16).toString('base64url'),
      status: options.status ?? 'NEW',
      statusReason: options.statusReason ?? null,
      duplicateCandidateOfId: options.candidateOfId ?? null,
      ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
    },
    select: { id: true },
  })
  return report.id
}

beforeEach(async () => {
  await truncateData(prisma)
  const category = await prisma.category.findFirstOrThrow({ select: { id: true } })
  categoryId = category.id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('DuplicatesService.findCandidateRootId (SRS §3.2)', () => {
  it('не находит никого на пустой базе', async () => {
    expect(await duplicates.findCandidateRootId(ORIGIN.latitude, ORIGIN.longitude)).toBeNull()
  })

  it('находит заявку в 30 м и не находит в 300 м', async () => {
    const near = await createReport(NEAR)
    expect(await duplicates.findCandidateRootId(ORIGIN.latitude, ORIGIN.longitude)).toBe(near)

    await truncateData(prisma)
    await createReport(FAR)
    expect(await duplicates.findCandidateRootId(ORIGIN.latitude, ORIGIN.longitude)).toBeNull()
  })

  it('не выдаёт REJECTED: мусорная отправка не собирает вокруг себя кластер', async () => {
    // Причина обязательна на уровне БД: REJECTED без неё отклоняет CHECK (SRS §2.2).
    await createReport(NEAR, { status: 'REJECTED', statusReason: 'spam' })
    expect(await duplicates.findCandidateRootId(ORIGIN.latitude, ORIGIN.longitude)).toBeNull()
  })

  it('цепляет к самой ранней открытой заявке, а не к ближайшей по времени', async () => {
    const earliest = await createReport(NEAR, { createdAt: new Date('2026-08-01T10:00:00.000Z') })
    await createReport(NEAR, { createdAt: new Date('2026-08-02T10:00:00.000Z') })
    expect(await duplicates.findCandidateRootId(ORIGIN.latitude, ORIGIN.longitude)).toBe(earliest)
  })

  it('строит звезду, а не цепочку: третья заявка получает корень, а не свою соседку', async () => {
    const root = await createReport(NEAR, { createdAt: new Date('2026-08-01T10:00:00.000Z') })
    const branch = await createReport(NEAR, {
      createdAt: new Date('2026-08-02T10:00:00.000Z'),
      candidateOfId: root,
    })

    const found = await duplicates.findCandidateRootId(ORIGIN.latitude, ORIGIN.longitude)
    expect(found).toBe(root)
    expect(found).not.toBe(branch)
  })
})
