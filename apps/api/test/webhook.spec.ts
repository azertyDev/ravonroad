import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { encodeCallbackData } from '../src/telegram/callback-data'
import { seedModerators } from '../src/telegram/moderators.seed'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'
import {
  applyTelegramEnv,
  callbackUpdate,
  postUpdate,
  resetTelegramTables,
  seedModerator,
  seedReport,
  startFakeTelegram,
  type FakeTelegram,
} from './support/telegram'

const prisma = createTestPrisma()
let app: TestApp
let telegram: FakeTelegram

/** Модератор из allowlist и посторонний участник группы. Второй существует, потому что
 *  кнопки в группе видны всем — это свойство Telegram, а не гипотеза (SRS §9.4). */
const MODERATOR_TG_ID = 700_000_001
const OUTSIDER_TG_ID = 700_000_002

beforeAll(async () => {
  telegram = await startFakeTelegram()
  applyTelegramEnv(telegram)
  app = await startTestApp()
})

beforeEach(async () => {
  await truncateData(prisma)
  await resetTelegramTables(prisma)
  telegram.reset()
})

afterAll(async () => {
  await app.close()
  await telegram.close()
  await prisma.$disconnect()
})

describe('Webhook: проверка отправителя (SRS §6.2, §9.3)', () => {
  it('отклоняет запрос без заголовка secret-token', async () => {
    const report = await seedReport(prisma, { cardMessageId: 11 })
    const response = await fetch(`${app.baseUrl}/api/telegram/webhook/test-webhook-path`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(callbackUpdate({ data: '1:s:1:AC', fromId: MODERATOR_TG_ID })),
    })

    expect(response.status).toBe(401)
    // Разбор тела не начат: ни одной записи, ни одного вызова Bot API.
    expect(await prisma.processedUpdate.count()).toBe(0)
    expect(telegram.calls).toHaveLength(0)
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
  })

  it('отклоняет неверный secret-token', async () => {
    const response = await postUpdate(app.baseUrl, callbackUpdate({ data: '1:s:1:AC', fromId: MODERATOR_TG_ID }), {
      secret: 'wrong-secret',
    })
    expect(response.status).toBe(401)
    expect(await prisma.processedUpdate.count()).toBe(0)
  })

  it('отклоняет secret-token другой длины — сравнение не бросает исключение', async () => {
    const response = await postUpdate(app.baseUrl, callbackUpdate({ data: '1:s:1:AC', fromId: MODERATOR_TG_ID }), {
      secret: 'x',
    })
    expect(response.status).toBe(401)
  })

  it('отклоняет чужой сегмент пути — второй эшелон (SRS §9.3)', async () => {
    const response = await postUpdate(app.baseUrl, callbackUpdate({ data: '1:s:1:AC', fromId: MODERATOR_TG_ID }), {
      path: 'someone-elses-guess',
    })
    expect(response.status).toBe(401)
  })

  it('принимает верный secret-token и отвечает 200', async () => {
    await seedModerator(prisma, MODERATOR_TG_ID)
    const report = await seedReport(prisma, { cardMessageId: 11 })

    const response = await postUpdate(
      app.baseUrl,
      callbackUpdate({
        data: encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'AC' }),
        fromId: MODERATOR_TG_ID,
      }),
    )

    expect(response.status).toBe(200)
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('ACCEPTED')
  })

  it('отвечает 200 на тело, которое апдейтом не является: повтор ничего не изменит', async () => {
    const response = await postUpdate(app.baseUrl, { hello: 'world' })
    expect(response.status).toBe(200)
    expect(await prisma.processedUpdate.count()).toBe(0)
  })
})

describe('Webhook: идемпотентность (SRS §6.11)', () => {
  it('повторная доставка того же update_id не создаёт второго перехода', async () => {
    await seedModerator(prisma, MODERATOR_TG_ID)
    const report = await seedReport(prisma, { cardMessageId: 11 })
    const update = callbackUpdate({
      data: encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'AC' }),
      fromId: MODERATOR_TG_ID,
      updateId: 999_001,
    })

    expect((await postUpdate(app.baseUrl, update)).status).toBe(200)
    expect((await postUpdate(app.baseUrl, update)).status).toBe(200)

    expect(await prisma.processedUpdate.count()).toBe(1)
    // Одна запись перехода на два одинаковых апдейта — плюс запись о создании заявки.
    const history = await prisma.reportStatusHistory.findMany({ where: { reportId: report.id } })
    expect(history.filter((row) => row.toStatus === 'ACCEPTED')).toHaveLength(1)
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('ACCEPTED')
  })
})

describe('Webhook: allowlist (US-024, AC-2)', () => {
  it('нажатие вне allowlist не меняет статус и не пишет ни одной строки', async () => {
    const report = await seedReport(prisma, { cardMessageId: 11 })
    const historyBefore = await prisma.reportStatusHistory.count()

    const response = await postUpdate(
      app.baseUrl,
      callbackUpdate({
        data: encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'AC' }),
        fromId: OUTSIDER_TG_ID,
      }),
    )

    expect(response.status).toBe(200)
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
    expect(await prisma.reportStatusHistory.count()).toBe(historyBefore)
    expect(await prisma.processedUpdate.count()).toBe(0)

    // Ответ приватный: alert видит только нажавший, в группе ни одного сообщения.
    const answers = telegram.of('answerCallbackQuery')
    expect(answers).toHaveLength(1)
    expect(answers[0]?.params['show_alert']).toBe(true)
    expect(String(answers[0]?.params['text'])).toContain('moderatorlar uchun')
    expect(telegram.of('sendMessage')).toHaveLength(0)
  })

  it('деактивированный модератор теряет право с первого же нажатия', async () => {
    await seedModerator(prisma, MODERATOR_TG_ID)
    await prisma.moderator.updateMany({
      where: { telegramUserId: BigInt(MODERATOR_TG_ID) },
      data: { isActive: false, deactivatedAt: new Date() },
    })
    const report = await seedReport(prisma, { cardMessageId: 11 })

    await postUpdate(
      app.baseUrl,
      callbackUpdate({
        data: encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'AC' }),
        fromId: MODERATOR_TG_ID,
      }),
    )

    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
  })

  it('состав allowlist меняется UPDATE-ом и действует без передеплоя (US-024)', async () => {
    const report = await seedReport(prisma, { cardMessageId: 11 })
    const press = () =>
      postUpdate(
        app.baseUrl,
        callbackUpdate({
          data: encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'AC' }),
          fromId: OUTSIDER_TG_ID,
        }),
      )

    await press()
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')

    await seedModerator(prisma, OUTSIDER_TG_ID, 'Новый')
    await press()
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('ACCEPTED')
  })

  it('первичный засев добавляет модераторов без автора и не дублирует их (T-066)', async () => {
    // Мусор в переменной пропускается молча: лишняя запятая не должна оставлять
    // кампанию без API.
    await seedModerators(prisma, ` ${MODERATOR_TG_ID}, ${OUTSIDER_TG_ID} , мусор,,`)
    const seeded = await prisma.moderator.findMany({ orderBy: { telegramUserId: 'asc' } })

    expect(seeded).toHaveLength(2)
    expect(seeded.every((row) => row.addedByModeratorId === null && row.isActive)).toBe(true)

    await seedModerators(prisma, String(MODERATOR_TG_ID))
    expect(await prisma.moderator.count()).toBe(2)
  })

  it('подделанный callback_data не доходит до записи', async () => {
    const report = await seedReport(prisma, { cardMessageId: 11 })
    for (const data of ['1:s:999999:AC', 'нажми меня', '2:s:1:AC']) {
      await postUpdate(app.baseUrl, callbackUpdate({ data, fromId: OUTSIDER_TG_ID }))
    }
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
    expect(await prisma.processedUpdate.count()).toBe(0)
  })
})
