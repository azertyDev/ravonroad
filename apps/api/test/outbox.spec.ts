import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { InlineKeyboardButton } from '../src/telegram/bot-api.client'
import { encodeCallbackData } from '../src/telegram/callback-data'
import type { OutboxWorker } from '../src/telegram/outbox.worker'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'
import {
  applyTelegramEnv,
  buildOutboxWorker,
  callbackUpdate,
  postUpdate,
  resetTelegramTables,
  seedModerator,
  seedReport,
  startFakeTelegram,
  type FakeTelegram,
  type SeededReport,
} from './support/telegram'

const prisma = createTestPrisma()
let app: TestApp
let telegram: FakeTelegram
let worker: OutboxWorker

const MODERATOR_TG_ID = 950_000_001

async function queueCard(report: SeededReport): Promise<void> {
  await prisma.telegramOutbox.create({ data: { reportId: report.id, kind: 'CARD_CREATE', payload: {} } })
}

async function seedQueue(count: number): Promise<SeededReport[]> {
  const reports: SeededReport[] = []
  for (let index = 0; index < count; index += 1) {
    const report = await seedReport(prisma, { withReadyPhoto: true })
    await queueCard(report)
    reports.push(report)
  }
  return reports
}

function keyboardOf(call: { params: Record<string, unknown> } | undefined): InlineKeyboardButton[][] {
  const markup = call?.params['reply_markup'] as { inline_keyboard: InlineKeyboardButton[][] } | undefined
  return markup?.inline_keyboard ?? []
}

beforeAll(async () => {
  telegram = await startFakeTelegram()
  applyTelegramEnv(telegram)
  app = await startTestApp()
  worker = buildOutboxWorker(prisma)
})

beforeEach(async () => {
  await truncateData(prisma)
  await resetTelegramTables(prisma)
  telegram.reset()
  // Бюджет живёт в памяти воркера, поэтому между тестами нужен чистый экземпляр.
  worker = buildOutboxWorker(prisma)
})

afterAll(async () => {
  await app.close()
  await telegram.close()
  await prisma.$disconnect()
})

describe('Доставка карточки (US-018, SRS §6.3, §6.7)', () => {
  it('отправляет альбом и сообщение с кнопками и запоминает оба message_id', async () => {
    const report = await seedReport(prisma, { withReadyPhoto: true, landmark: 'напротив дома 12' })
    await queueCard(report)

    expect(await worker.tick()).toBe(2)

    const album = telegram.of('sendMediaGroup').at(0)
    const media = album?.params['media'] as { caption?: string }[]
    expect(media).toHaveLength(1)
    expect(media[0]?.caption).toContain(`RR-${report.publicNumber}`)
    expect(media[0]?.caption).toContain('Чиланзар')
    expect(media[0]?.caption).toContain('напротив дома 12')
    expect(media[0]?.caption).toContain('yandex.uz/maps')

    const card = telegram.of('sendMessage').at(0)
    expect(card?.params['reply_to_message_id']).toBe(album === undefined ? null : 101)
    expect(keyboardOf(card).flat().map((button) => button.text)).toEqual([
      'Принять',
      'Отклонить',
      'Дубль',
      'Не по силам',
    ])

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(stored.telegramAlbumMessageId).toBe(101)
    expect(stored.telegramCardMessageId).toBe(102)
    expect((await prisma.telegramOutbox.findFirstOrThrow()).sentAt).not.toBeNull()
  })

  it('в карточке нет ни телефона, ни ника заявителя', async () => {
    const report = await seedReport(prisma, { withReadyPhoto: true })
    await prisma.report.update({
      where: { id: report.id },
      data: { contactPhone: '+998901234567', contactTelegram: '@reporter' },
    })
    await queueCard(report)
    await worker.tick()

    const everything = JSON.stringify(telegram.calls)
    expect(everything).not.toContain('998901234567')
    expect(everything).not.toContain('reporter')
  })

  it('строка «проверить» появляется при сигналах антиабуза (US-025)', async () => {
    const report = await seedReport(prisma, { withReadyPhoto: true })
    await prisma.abuseSignal.create({ data: { reportId: report.id, rule: 'FAST_FILL' } })
    await queueCard(report)
    await worker.tick()

    const media = telegram.of('sendMediaGroup').at(0)?.params['media'] as { caption?: string }[]
    expect(media[0]?.caption).toContain('⚠️ проверить')
  })

  it('недоступный Telegram не теряет карточку — она уходит после восстановления', async () => {
    const report = await seedReport(prisma, { withReadyPhoto: true })
    await queueCard(report)

    telegram.mode = 'down'
    expect(await worker.tick()).toBe(0)

    const failed = await prisma.telegramOutbox.findFirstOrThrow()
    expect(failed.sentAt).toBeNull()
    expect(failed.attempts).toBe(1)
    // Backoff: первая пауза — 10 секунд (SRS §6.7).
    expect(failed.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 5_000)

    telegram.mode = 'ok'
    await prisma.telegramOutbox.update({ where: { id: failed.id }, data: { nextAttemptAt: new Date() } })
    expect(await worker.tick()).toBe(2)
    expect((await prisma.telegramOutbox.findFirstOrThrow()).sentAt).not.toBeNull()
  })

  it('429 сдвигает срок и не засчитывает попытку: это расписание, а не ошибка', async () => {
    const report = await seedReport(prisma, { withReadyPhoto: true })
    await queueCard(report)

    telegram.mode = 'rate-limited'
    telegram.retryAfter = 45
    await worker.tick()

    const row = await prisma.telegramOutbox.findFirstOrThrow()
    expect(row.attempts).toBe(0)
    expect(row.sentAt).toBeNull()
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 40_000)
    expect(row.nextAttemptAt.getTime()).toBeLessThan(Date.now() + 50_000)
  })

  it('400 закрывает запись: долбить мёртвый вызов бессмысленно', async () => {
    const report = await seedReport(prisma, { withReadyPhoto: true })
    await queueCard(report)

    telegram.mode = 'gone'
    await worker.tick()

    const row = await prisma.telegramOutbox.findFirstOrThrow()
    expect(row.sentAt).not.toBeNull()
    expect(row.lastError).toContain('chat not found')
  })
})

describe('Бюджет канала (AC-9, SRS §6.7)', () => {
  it('не берёт задачи сверх двадцати сообщений в минуту', async () => {
    await seedQueue(15)

    // Карточка — два сообщения, поэтому за минуту их помещается десять.
    expect(await worker.tick()).toBe(20)
    expect(await prisma.telegramOutbox.count({ where: { sentAt: null } })).toBe(5)

    // Второй проход в ту же минуту не отправляет ничего и ничего не теряет.
    expect(await worker.tick()).toBe(0)
    expect(await prisma.telegramOutbox.count({ where: { sentAt: null } })).toBe(5)
  })
})

describe('Digest при очереди больше тридцати (AC-9, SRS §6.13)', () => {
  it('уходит одним сообщением на десять заявок, без фотографий', async () => {
    await seedQueue(31)

    expect(await worker.tick()).toBe(1)
    expect(telegram.of('sendMediaGroup')).toHaveLength(0)

    const digest = telegram.of('sendMessage').at(0)
    const text = String(digest?.params['text'])
    expect(text).toContain('Новых заявок: 10')
    expect(keyboardOf(digest).flat().map((button) => button.text)).toEqual([
      'Принять все',
      'Отклонить все',
      'Раскрыть',
    ])

    const batch = await prisma.moderationBatch.findFirstOrThrow()
    expect(batch.kind).toBe('DIGEST')
    expect(batch.reportIds).toHaveLength(10)
    expect(batch.messageId).not.toBeNull()
    expect(await prisma.telegramOutbox.count({ where: { sentAt: { not: null } } })).toBe(10)
  })
})

describe('Пакетные действия (AC-10, SRS §6.14)', () => {
  async function digestBatch(): Promise<{ id: number; reportIds: number[] }> {
    await seedQueue(31)
    await worker.tick()
    const batch = await prisma.moderationBatch.findFirstOrThrow()
    return { id: batch.id, reportIds: batch.reportIds }
  }

  it('«Принять все» применяется только к заявкам в ожидаемом статусе', async () => {
    await seedModerator(prisma, MODERATOR_TG_ID)
    const batch = await digestBatch()

    // Две заявки успел изменить другой модератор.
    await prisma.report.updateMany({
      where: { id: { in: batch.reportIds.slice(0, 2) } },
      data: { status: 'IN_PROGRESS' },
    })

    telegram.reset()
    await postUpdate(
      app.baseUrl,
      callbackUpdate({ data: encodeCallbackData({ op: 'B', n: batch.id, arg: 'AC' }), fromId: MODERATOR_TG_ID }),
    )

    const answer = String(telegram.of('answerCallbackQuery').at(0)?.params['text'])
    expect(answer).toContain('применено к 8 из 10')

    expect(await prisma.report.count({ where: { id: { in: batch.reportIds }, status: 'ACCEPTED' } })).toBe(8)
    // История поштучная: по строке на каждую затронутую заявку, иначе пропадёт аудит.
    const history = await prisma.reportStatusHistory.findMany({
      where: { reportId: { in: batch.reportIds }, toStatus: 'ACCEPTED' },
    })
    expect(history).toHaveLength(8)
    expect(history.every((row) => row.moderatorId !== null)).toBe(true)
  })

  it('повторное нажатие отклоняется по applied_at', async () => {
    await seedModerator(prisma, MODERATOR_TG_ID)
    const batch = await digestBatch()
    const press = () =>
      postUpdate(
        app.baseUrl,
        callbackUpdate({ data: encodeCallbackData({ op: 'B', n: batch.id, arg: 'AC' }), fromId: MODERATOR_TG_ID }),
      )

    await press()
    telegram.reset()
    await press()

    expect(String(telegram.of('answerCallbackQuery').at(0)?.params['text'])).toContain('уже обработан')
    expect(await prisma.reportStatusHistory.count({ where: { toStatus: 'ACCEPTED' } })).toBe(10)
  })

  it('отмена пакета возвращает весь состав одной кнопкой', async () => {
    await seedModerator(prisma, MODERATOR_TG_ID)
    const batch = await digestBatch()
    await postUpdate(
      app.baseUrl,
      callbackUpdate({ data: encodeCallbackData({ op: 'B', n: batch.id, arg: 'AC' }), fromId: MODERATOR_TG_ID }),
    )

    telegram.reset()
    await postUpdate(
      app.baseUrl,
      callbackUpdate({ data: encodeCallbackData({ op: 'U', n: batch.id }), fromId: MODERATOR_TG_ID }),
    )

    expect(String(telegram.of('answerCallbackQuery').at(0)?.params['text'])).toContain('Отменено заявок: 10')
    expect(await prisma.report.count({ where: { id: { in: batch.reportIds }, status: 'NEW' } })).toBe(10)
    // Отмена — новые строки истории, а не правка старых.
    expect(await prisma.reportStatusHistory.count({ where: { undoesHistoryId: { not: null } } })).toBe(10)
  })
})

describe('Кластеры дублей (AC-10, SRS §6.14)', () => {
  async function seedCluster(): Promise<{ root: SeededReport; members: SeededReport[]; batchId: number }> {
    const root = await seedReport(prisma, { withReadyPhoto: true })
    const members = [
      await seedReport(prisma, { duplicateCandidateOfId: root.id }),
      await seedReport(prisma, { duplicateCandidateOfId: root.id }),
    ]
    await queueCard(root)
    for (const member of members) await queueCard(member)

    await worker.tick()
    const batch = await prisma.moderationBatch.findFirstOrThrow()
    return { root, members, batchId: batch.id }
  }

  it('три точки рядом дают одну карточку с одним корнем', async () => {
    const { root, batchId } = await seedCluster()

    // Одна карточка на кластер: альбом и сообщение с кнопками, а не три пары.
    expect(telegram.of('sendMediaGroup')).toHaveLength(1)
    expect(telegram.of('sendMessage')).toHaveLength(1)

    const batch = await prisma.moderationBatch.findUniqueOrThrow({ where: { id: batchId } })
    expect(batch.kind).toBe('DUPLICATE_CLUSTER')
    expect(batch.reportIds[0]).toBe(root.id)
    expect(batch.reportIds).toHaveLength(3)

    const buttons = keyboardOf(telegram.of('sendMessage').at(0)).flat().map((button) => button.text)
    expect(buttons).toContain(`Все дубли RR-${root.publicNumber} (2)`)
    expect(buttons).toContain('Разные ямы')
    expect(buttons).toContain('Раскрыть')
    // Карточки спутников закрыты: их показала карточка кластера.
    expect(await prisma.telegramOutbox.count({ where: { sentAt: null } })).toBe(0)
  })

  it('«Все дубли» переводит всех, кроме корня, без второго шага', async () => {
    await seedModerator(prisma, MODERATOR_TG_ID)
    const { root, members, batchId } = await seedCluster()

    await postUpdate(
      app.baseUrl,
      callbackUpdate({ data: encodeCallbackData({ op: 'B', n: batchId, arg: 'D' }), fromId: MODERATOR_TG_ID }),
    )

    expect((await prisma.report.findUniqueOrThrow({ where: { id: root.id } })).status).toBe('NEW')
    for (const member of members) {
      const stored = await prisma.report.findUniqueOrThrow({ where: { id: member.id } })
      expect(stored.status).toBe('DUPLICATE')
      expect(stored.duplicateOfId).toBe(root.id)
    }
  })

  it('«Разные ямы» снимает гипотезу и не трогает статусы', async () => {
    await seedModerator(prisma, MODERATOR_TG_ID)
    const { root, members, batchId } = await seedCluster()

    await postUpdate(
      app.baseUrl,
      callbackUpdate({ data: encodeCallbackData({ op: 'B', n: batchId, arg: 'X' }), fromId: MODERATOR_TG_ID }),
    )

    for (const member of members) {
      const stored = await prisma.report.findUniqueOrThrow({ where: { id: member.id } })
      expect(stored.duplicateCandidateOfId).toBeNull()
      expect(stored.status).toBe('NEW')
    }
    expect((await prisma.report.findUniqueOrThrow({ where: { id: root.id } })).status).toBe('NEW')
    // Заявки вернулись в обычную очередь поштучно.
    expect(await prisma.telegramOutbox.count({ where: { kind: 'CARD_CREATE', sentAt: null } })).toBe(2)
  })
})
