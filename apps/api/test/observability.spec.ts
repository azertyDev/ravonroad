import { ConfigService } from '@nestjs/config'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { queueDepths } from '../src/common/queue-depths'
import { CleanupService } from '../src/maintenance/cleanup.service'
import { AlertsService } from '../src/telegram/alerts.service'
import { BotApiClient } from '../src/telegram/bot-api.client'
import { WebhookHealthService } from '../src/telegram/webhook-health.service'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'
import {
  applyTelegramEnv,
  resetTelegramTables,
  seedReport,
  startFakeTelegram,
  WEBHOOK_PATH,
  type FakeTelegram,
} from './support/telegram'

const prisma = createTestPrisma()
let app: TestApp
let telegram: FakeTelegram

const ALERT_CHAT_ID = '-1009999999999'
const HOUR_MS = 60 * 60_000

beforeAll(async () => {
  telegram = await startFakeTelegram()
  applyTelegramEnv(telegram)
  process.env['TELEGRAM_ALERT_CHAT_ID'] = ALERT_CHAT_ID
  app = await startTestApp()
})

beforeEach(async () => {
  await truncateData(prisma)
  await resetTelegramTables(prisma)
  telegram.reset()
  // Адрес webhook по умолчанию — наш: иначе каждая проверка начиналась бы с алерта
  // «webhook уводит апдейты на чужой адрес», и молчания в норме не существовало бы.
  telegram.webhookUrl = `${process.env['WEB_ORIGIN'] ?? ''}/api/telegram/webhook/${WEBHOOK_PATH}`
  telegram.pendingUpdates = 0
})

afterAll(async () => {
  await app.close()
  await telegram.close()
  await prisma.$disconnect()
})

function alertsService(alertChatId: string = ALERT_CHAT_ID): AlertsService {
  const config = new ConfigService()
  const bot = new BotApiClient(config)
  // Значение подменяется здесь, а не в process.env: BotApiClient читает окружение
  // в конструкторе, и подмена после сборки клиента ни на что бы не влияла.
  const withChat = {
    get: (key: string) => (key === 'TELEGRAM_ALERT_CHAT_ID' ? alertChatId : config.get(key)),
    getOrThrow: (key: string) => config.getOrThrow(key),
  } as unknown as ConfigService
  return new AlertsService(withChat, prisma, bot, new WebhookHealthService(config, bot))
}

describe('queue_depth — три глубины и провалы (SRS §10.3)', () => {
  it('считает очередь фото, доставки и модерации одним запросом', async () => {
    const pending = await seedReport(prisma)
    await seedReport(prisma, { status: 'ACCEPTED' })
    await prisma.reportPhoto.createMany({
      data: [
        { reportId: pending.id, kind: 'BEFORE', sortOrder: 0, state: 'PENDING', rawKey: 'incoming/a' },
        { reportId: pending.id, kind: 'BEFORE', sortOrder: 1, state: 'FAILED', rawKey: 'incoming/b' },
      ],
    })
    await prisma.telegramOutbox.create({ data: { reportId: pending.id, kind: 'CARD_CREATE', payload: {} } })

    const depths = await queueDepths(prisma)
    expect(depths).toMatchObject({ photoQueue: 1, deliveryQueue: 1, moderationQueue: 1, photoFailed: 1 })
    // Возраст свежей задачи — ноль секунд, а не null: очередь не пуста.
    expect(depths.oldestPhotoS).toBe(0)
    expect(depths.oldestDeliveryS).toBe(0)
  })

  it('на пустых очередях возраст пуст, а не ноль', async () => {
    const depths = await queueDepths(prisma)
    expect(depths).toMatchObject({ photoQueue: 0, deliveryQueue: 0, moderationQueue: 0, photoFailed: 0 })
    expect(depths.oldestPhotoS).toBeNull()
    expect(depths.oldestDeliveryS).toBeNull()
  })
})

describe('/health/details (SRS §10.1)', () => {
  it('показывает состояние БД, хранилища, Telegram и очередей', async () => {
    const response = await fetch(`${app.baseUrl}/health/details`)
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({ db: 'up', storage: 'up' })
    expect(body['queues']).toMatchObject({ photo: 0, delivery: 0, moderation: 0, photoFailed: 0 })
    expect(body['telegram']).toMatchObject({ pendingUpdates: 0 })
    expect(typeof body['uptimeS']).toBe('number')
  })

  it('не содержит ни секретов, ни персональных данных', async () => {
    const withContacts = await seedReport(prisma)
    await prisma.report.update({
      where: { id: withContacts.id },
      data: { contactPhone: '+998901234567', contactTelegram: '@resident', createdIp: '198.51.100.7' },
    })

    const text = await (await fetch(`${app.baseUrl}/health/details`)).text()
    for (const secret of ['test-bot-token', 'test-secret', 'test-webhook-secret', '+998901234567', '@resident', '198.51.100.7']) {
      expect(text).not.toContain(secret)
    }
  })

  it('оставляет /ready на 200 при мёртвом хранилище', async () => {
    app.storage.failing = true
    try {
      // Readiness проверяет только БД: чужой сбой не должен выключать работающий сервис
      // (SRS §10.1). Деградация при этом обязана быть видна в /health/details.
      expect((await fetch(`${app.baseUrl}/ready`)).status).toBe(200)
    } finally {
      app.storage.failing = false
    }
  })
})

describe('Алерты координатору (SRS §10.4)', () => {
  it('шлёт сообщение в приватный чат, а не в группу волонтёров', async () => {
    await prisma.reportPhoto.create({
      data: {
        reportId: (await seedReport(prisma)).id,
        kind: 'BEFORE',
        sortOrder: 0,
        state: 'FAILED',
        rawKey: 'incoming/dead',
      },
    })

    const sent = await alertsService().check()
    expect(sent.map((alert) => alert.condition)).toContain('photo_failed')

    const messages = telegram.of('sendMessage')
    expect(messages).toHaveLength(1)
    expect(messages[0]?.params['chat_id']).toBe(ALERT_CHAT_ID)
    // Мимо `telegram_outbox`: бюджет 20 сообщений/мин принадлежит группе, и алерт
    // о вставшей очереди не должен вставать в ту очередь, о которой сообщает.
    expect(await prisma.telegramOutbox.count()).toBe(0)
  })

  it('держащееся час условие даёт одно сообщение, а не двенадцать', async () => {
    await prisma.reportPhoto.create({
      data: {
        reportId: (await seedReport(prisma)).id,
        kind: 'BEFORE',
        sortOrder: 0,
        state: 'FAILED',
        rawKey: 'incoming/dead',
      },
    })

    const alerts = alertsService()
    const start = Date.now()
    // Двенадцать проверок за час — ровно столько их и будет при интервале в пять минут.
    for (let pass = 0; pass < 12; pass += 1) await alerts.check(start + pass * 5 * 60_000)
    expect(telegram.of('sendMessage')).toHaveLength(1)

    // Час прошёл — поломка всё ещё здесь, и напомнить о ней надо.
    await alerts.check(start + HOUR_MS)
    expect(telegram.of('sendMessage')).toHaveLength(2)
  })

  it('считает пустой TELEGRAM_ALERT_CHAT_ID незаданным', async () => {
    // compose передаёт переменную как `${VAR:-}`, и «не задана» приходит пустой строкой.
    // Сервис, считающий себя настроенным, слал бы алерты в чат с пустым идентификатором.
    await prisma.reportPhoto.create({
      data: {
        reportId: (await seedReport(prisma)).id,
        kind: 'BEFORE',
        sortOrder: 0,
        state: 'FAILED',
        rawKey: 'incoming/dead',
      },
    })

    expect(await alertsService('').check()).toEqual([])
    expect(telegram.of('sendMessage')).toHaveLength(0)
  })

  it('молчит, когда всё в порядке', async () => {
    expect(await alertsService().check()).toEqual([])
    expect(telegram.of('sendMessage')).toHaveLength(0)
  })

  it('замечает сброшенный webhook', async () => {
    // Пустой url означает, что webhook кто-то сбил чужим `setWebhook`: с этой минуты
    // модерация стоит, а апдейты копятся у Telegram (SRS §10.4).
    telegram.webhookUrl = ''
    const sent = await alertsService().check()
    expect(sent.map((alert) => alert.condition)).toContain('webhook_missing')
  })

  it('замечает чужой адрес webhook', async () => {
    telegram.webhookUrl = 'https://not-ours.example/api/telegram/webhook/whatever'
    const sent = await alertsService().check()
    expect(sent.map((alert) => alert.condition)).toContain('webhook_foreign')
  })

  it('замечает копящиеся у Telegram апдейты', async () => {
    telegram.pendingUpdates = 21
    const sent = await alertsService().check()
    expect(sent.map((alert) => alert.condition)).toContain('webhook_pending')
  })
})

describe('Суточная очистка (SRS §9.8, §2.11, §2.12, PRD §9.2.5)', () => {
  it('обнуляет created_ip заявкам старше 30 дней и не трогает свежие', async () => {
    const old = await seedReport(prisma)
    const fresh = await seedReport(prisma)
    await prisma.report.updateMany({ data: { createdIp: '198.51.100.7' } })
    await prisma.$executeRawUnsafe(`UPDATE report SET created_at = now() - interval '31 days' WHERE id = ${old.id}`)

    const outcome = await new CleanupService(prisma).run()
    expect(outcome.ipCleared).toBe(1)
    expect((await prisma.report.findUniqueOrThrow({ where: { id: old.id } })).createdIp).toBeNull()
    expect((await prisma.report.findUniqueOrThrow({ where: { id: fresh.id } })).createdIp).toBe('198.51.100.7')
  })

  it('удаляет контакты через 90 дней после терминального статуса, оставляя заявку и фото', async () => {
    const done = await seedReport(prisma, { status: 'DONE', readyPhotos: 1 })
    const recent = await seedReport(prisma, { status: 'DONE' })
    const open = await seedReport(prisma, { status: 'IN_PROGRESS' })
    await prisma.report.updateMany({ data: { contactPhone: '+998901234567', contactTelegram: '@resident' } })
    for (const report of [done, recent, open]) {
      await prisma.reportStatusHistory.create({
        data: { reportId: report.id, fromStatus: 'NEW', toStatus: report === open ? 'IN_PROGRESS' : 'DONE', actorType: 'MODERATOR' },
      })
    }
    // Старой делается только первая: срок считается от входа в терминальный статус,
    // а не от создания заявки (PRD §9.2.5).
    await prisma.$executeRawUnsafe(
      `UPDATE report_status_history SET created_at = now() - interval '91 days' WHERE report_id = ${done.id}`,
    )

    const outcome = await new CleanupService(prisma).run()
    expect(outcome.contactsDeleted).toBe(1)

    const cleaned = await prisma.report.findUniqueOrThrow({ where: { id: done.id } })
    expect(cleaned.contactPhone).toBeNull()
    expect(cleaned.contactTelegram).toBeNull()
    expect(cleaned.contactsDeletedAt).not.toBeNull()
    // Заявка и её фотография остаются: удаляются контакты, а не история кампании.
    expect(cleaned.status).toBe('DONE')
    expect(await prisma.reportPhoto.count({ where: { reportId: done.id } })).toBe(1)

    expect((await prisma.report.findUniqueOrThrow({ where: { id: recent.id } })).contactPhone).not.toBeNull()
    expect((await prisma.report.findUniqueOrThrow({ where: { id: open.id } })).contactPhone).not.toBeNull()
  })

  it('чистит processed_update старше семи дней и просроченные bot_prompt', async () => {
    const report = await seedReport(prisma)
    const moderator = await prisma.moderator.create({ data: { telegramUserId: BigInt(4242) } })
    await prisma.processedUpdate.createMany({ data: [{ updateId: BigInt(1) }, { updateId: BigInt(2) }] })
    await prisma.$executeRawUnsafe(`UPDATE processed_update SET created_at = now() - interval '8 days' WHERE update_id = 1`)
    await prisma.botPrompt.createMany({
      data: [
        {
          chatId: BigInt(-100),
          messageId: 1,
          reportId: report.id,
          kind: 'REASON_TEXT',
          moderatorId: moderator.id,
          expiresAt: new Date(Date.now() - 60_000),
        },
        {
          chatId: BigInt(-100),
          messageId: 2,
          reportId: report.id,
          kind: 'REASON_TEXT',
          moderatorId: moderator.id,
          expiresAt: new Date(Date.now() + HOUR_MS),
        },
      ],
    })

    const outcome = await new CleanupService(prisma).run()
    expect(outcome).toMatchObject({ processedUpdates: 1, botPrompts: 1 })
    expect(await prisma.processedUpdate.count()).toBe(1)
    expect(await prisma.botPrompt.count()).toBe(1)
  })

  it('второй проход в тот же день не трогает ни одной строки', async () => {
    const old = await seedReport(prisma)
    await prisma.report.updateMany({ data: { createdIp: '198.51.100.7' } })
    await prisma.$executeRawUnsafe(`UPDATE report SET created_at = now() - interval '31 days' WHERE id = ${old.id}`)

    const cleanup = new CleanupService(prisma)
    expect((await cleanup.run()).ipCleared).toBe(1)
    expect((await cleanup.run()).ipCleared).toBe(0)
  })
})
