import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyTransition } from '../src/reports/transitions'
import { encodeCallbackData } from '../src/telegram/callback-data'
import type { OutboxWorker } from '../src/telegram/outbox.worker'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'
import {
  applyTelegramEnv,
  buildOutboxWorker,
  callbackUpdate,
  messageUpdate,
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
let worker: OutboxWorker

const ALBUM_MESSAGE_ID = 77
const CARD_MESSAGE_ID = 78
/** Волонтёр без прав модератора: фото «после» принимает любой участник (PRD §12.4). */
const VOLUNTEER_TG_ID = 900_000_001
const MODERATOR_TG_ID = 900_000_002

/** Буфер альбома — 2 секунды (SRS §6.8 п.5). */
const ALBUM_WAIT_MS = 2400

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
  app.storage.objects.clear()
})

afterAll(async () => {
  await app.close()
  await telegram.close()
  await prisma.$disconnect()
})

function sendPhoto(options: {
  replyTo?: number
  mediaGroupId?: string
  fromId?: number
  chatId?: number
}): Promise<Response> {
  return postUpdate(
    app.baseUrl,
    messageUpdate({
      fromId: options.fromId ?? VOLUNTEER_TG_ID,
      photo: true,
      ...(options.replyTo === undefined ? {} : { replyToMessageId: options.replyTo }),
      ...(options.mediaGroupId === undefined ? {} : { mediaGroupId: options.mediaGroupId }),
      ...(options.chatId === undefined ? {} : { chatId: options.chatId }),
    }),
  )
}

async function repliesText(): Promise<string> {
  await worker.tick()
  return telegram
    .of('sendMessage')
    .map((call) => String(call.params['text']))
    .join('\n')
}

describe('Фото «после» закрывают заявку (US-028, BR-006)', () => {
  it('одна фотография ответом на карточку переводит ACCEPTED в DONE', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID, cardMessageId: CARD_MESSAGE_ID })

    const response = await sendPhoto({ replyTo: ALBUM_MESSAGE_ID })
    expect(response.status).toBe(200)

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(stored.status).toBe('DONE')
    expect(stored.doneAt).not.toBeNull()

    const photos = await prisma.reportPhoto.findMany({ where: { reportId: report.id, kind: 'AFTER' } })
    expect(photos).toHaveLength(1)
    // Фото попадает в ту же очередь, что и «до»: sharp в обработчике апдейта не зовётся.
    expect(photos[0]?.state).toBe('PENDING')
    expect(photos[0]?.rawKey).not.toBeNull()
    expect(Number(photos[0]?.uploadedByTelegramUserId)).toBe(VOLUNTEER_TG_ID)

    const history = await prisma.reportStatusHistory.findFirstOrThrow({ where: { toStatus: 'DONE' } })
    expect(history.actorType).toBe('VOLUNTEER')
    expect(history.moderatorId).toBeNull()
    expect(await repliesText()).toContain('закрыта')
  })

  it('принимает ответ и на сообщение с кнопками — для волонтёра это одна карточка', async () => {
    const report = await seedReport(prisma, { status: 'IN_PROGRESS', albumMessageId: ALBUM_MESSAGE_ID, cardMessageId: CARD_MESSAGE_ID })
    await sendPhoto({ replyTo: CARD_MESSAGE_ID })
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('DONE')
  })

  it('альбом из трёх апдейтов даёт один переход и три фотографии', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID })

    await Promise.all([
      sendPhoto({ replyTo: ALBUM_MESSAGE_ID, mediaGroupId: 'album-1' }),
      sendPhoto({ replyTo: ALBUM_MESSAGE_ID, mediaGroupId: 'album-1' }),
      sendPhoto({ replyTo: ALBUM_MESSAGE_ID, mediaGroupId: 'album-1' }),
    ])
    await new Promise((resolve) => setTimeout(resolve, ALBUM_WAIT_MS))

    expect(await prisma.reportPhoto.count({ where: { reportId: report.id, kind: 'AFTER' } })).toBe(3)
    // Один переход, а не три: иначе два из них получили бы «статус уже изменён».
    expect(await prisma.reportStatusHistory.count({ where: { reportId: report.id, toStatus: 'DONE' } })).toBe(1)
  })

  it('четвёртая фотография не принимается, а лимит держит БД', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID })
    for (let index = 0; index < 3; index += 1) await sendPhoto({ replyTo: ALBUM_MESSAGE_ID })

    telegram.reset()
    await sendPhoto({ replyTo: ALBUM_MESSAGE_ID })

    expect(await prisma.reportPhoto.count({ where: { reportId: report.id, kind: 'AFTER' } })).toBe(3)
    expect(await repliesText()).toContain('уже есть 3')
  })

  it('фотография не ответом на карточку получает подсказку', async () => {
    await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID })
    await sendPhoto({})

    expect(await prisma.reportPhoto.count({ where: { kind: 'AFTER' } })).toBe(0)
    expect(await repliesText()).toContain('ответом на карточку')
  })

  it('заявка в NEW фотографии не принимает и называет свой статус', async () => {
    const report = await seedReport(prisma, { albumMessageId: ALBUM_MESSAGE_ID })
    await sendPhoto({ replyTo: ALBUM_MESSAGE_ID })

    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
    expect(await prisma.reportPhoto.count({ where: { kind: 'AFTER' } })).toBe(0)
    expect(await repliesText()).toContain('Новая')
  })

  it('в DONE фотографии добавляются, а счётчик повторно не растёт', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID })
    await sendPhoto({ replyTo: ALBUM_MESSAGE_ID })
    const doneAt = (await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).doneAt

    await sendPhoto({ replyTo: ALBUM_MESSAGE_ID })

    expect(await prisma.reportPhoto.count({ where: { reportId: report.id, kind: 'AFTER' } })).toBe(2)
    expect(await prisma.reportStatusHistory.count({ where: { reportId: report.id, toStatus: 'DONE' } })).toBe(1)
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).doneAt).toEqual(doneAt)
  })

  it('фотография из чужого чата к заявке отношения не имеет', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID })
    await sendPhoto({ replyTo: ALBUM_MESSAGE_ID, chatId: -100999 })
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('ACCEPTED')
  })
})

describe('Инвариант BR-006 и CHECK-и заявки (SRS §2.2, §11.3, T-065, T-082)', () => {
  it('DONE без фотографии «после» невозможен ни одним путём', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED' })

    const outcome = await prisma.$transaction((tx) =>
      applyTransition(tx, {
        publicNumber: report.publicNumber,
        to: 'DONE',
        actor: { type: 'VOLUNTEER', telegramUserId: BigInt(VOLUNTEER_TG_ID), moderatorId: null },
      }),
    )

    expect(outcome).toEqual({ ok: false, code: 'NO_AFTER_PHOTO' })
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('ACCEPTED')
  })

  it('кнопки DONE не существует ни при одном статусе', async () => {
    await seedModerator(prisma, MODERATOR_TG_ID)
    for (const status of ['NEW', 'ACCEPTED', 'IN_PROGRESS'] as const) {
      const report = await seedReport(prisma, { status, cardMessageId: CARD_MESSAGE_ID })
      // `s` несёт целевой статус; `DONE` в кодировке кнопок отсутствует, поэтому
      // единственный способ его назвать — подделать аргумент.
      await postUpdate(
        app.baseUrl,
        callbackUpdate({
          data: `1:s:${report.publicNumber}:DN`,
          fromId: MODERATOR_TG_ID,
          messageId: CARD_MESSAGE_ID,
        }),
      )
      expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe(status)
    }
  })

  it('CHECK отклоняет DONE без done_at', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED' })
    await expect(
      prisma.$executeRaw`UPDATE report SET status = 'DONE' WHERE id = ${report.id}`,
    ).rejects.toThrow(/report_done_at_check/)
  })

  it('CHECK отклоняет отказ без причины и дубликат без оригинала', async () => {
    const report = await seedReport(prisma, {})
    await expect(
      prisma.$executeRaw`UPDATE report SET status = 'REJECTED' WHERE id = ${report.id}`,
    ).rejects.toThrow(/report_status_reason_check/)
    await expect(
      prisma.$executeRaw`UPDATE report SET status = 'DUPLICATE' WHERE id = ${report.id}`,
    ).rejects.toThrow(/report_duplicate_target_check/)
  })
})

describe('Отмена закрытия (PRD §5.4)', () => {
  it('возвращает статус, обнуляет done_at и оставляет фотографии в БД', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID })
    await sendPhoto({ replyTo: ALBUM_MESSAGE_ID })
    const history = await prisma.reportStatusHistory.findFirstOrThrow({ where: { toStatus: 'DONE' } })

    // Отменяет автор перехода — волонтёр, которого нет в allowlist (SRS §6.10).
    await postUpdate(
      app.baseUrl,
      callbackUpdate({ data: encodeCallbackData({ op: 'u', n: history.id }), fromId: VOLUNTEER_TG_ID }),
    )

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(stored.status).toBe('ACCEPTED')
    expect(stored.doneAt).toBeNull()
    // Счётчик считается запросом по статусу, поэтому уменьшается сам.
    expect(await prisma.report.count({ where: { status: 'DONE' } })).toBe(0)
    // Фотографии остаются прикреплёнными, но публично не показываются: их публичность
    // выводится из статуса, отдельного флага нет.
    expect(await prisma.reportPhoto.count({ where: { reportId: report.id, kind: 'AFTER' } })).toBe(1)
  })

  it('посторонний волонтёр отменить чужое закрытие не может', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID })
    await sendPhoto({ replyTo: ALBUM_MESSAGE_ID })
    const history = await prisma.reportStatusHistory.findFirstOrThrow({ where: { toStatus: 'DONE' } })

    await postUpdate(
      app.baseUrl,
      callbackUpdate({ data: encodeCallbackData({ op: 'u', n: history.id }), fromId: 900_000_777 }),
    )
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('DONE')
  })
})

describe('Ссылка на публикацию (US-029, SRS §6.9)', () => {
  it('сохраняется при DONE и заменяется целиком', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID })
    await sendPhoto({ replyTo: ALBUM_MESSAGE_ID })

    await postUpdate(
      app.baseUrl,
      messageUpdate({
        fromId: VOLUNTEER_TG_ID,
        text: 'выложили https://instagram.com/p/first',
        replyToMessageId: ALBUM_MESSAGE_ID,
      }),
    )
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).publicationUrl).toBe(
      'https://instagram.com/p/first',
    )

    await postUpdate(
      app.baseUrl,
      messageUpdate({
        fromId: VOLUNTEER_TG_ID,
        text: 'https://instagram.com/p/second',
        replyToMessageId: ALBUM_MESSAGE_ID,
      }),
    )
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).publicationUrl).toBe(
      'https://instagram.com/p/second',
    )
  })

  it('до закрытия ссылка не принимается', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', albumMessageId: ALBUM_MESSAGE_ID })
    await postUpdate(
      app.baseUrl,
      messageUpdate({
        fromId: VOLUNTEER_TG_ID,
        text: 'https://instagram.com/p/early',
        replyToMessageId: ALBUM_MESSAGE_ID,
      }),
    )

    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).publicationUrl).toBeNull()
    expect(await repliesText()).toContain('после закрытия')
  })

  it('не-http ссылка ссылкой не считается', async () => {
    const report = await seedReport(prisma, { status: 'DONE', albumMessageId: ALBUM_MESSAGE_ID, withAfterPhoto: true })
    await postUpdate(
      app.baseUrl,
      messageUpdate({
        fromId: VOLUNTEER_TG_ID,
        text: 'javascript:alert(1) и ftp://example.test/x',
        replyToMessageId: ALBUM_MESSAGE_ID,
      }),
    )
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).publicationUrl).toBeNull()
  })
})
