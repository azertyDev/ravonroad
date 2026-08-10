import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { applyTransition } from '../src/reports/transitions'
import { encodeCallbackData } from '../src/telegram/callback-data'
import type { InlineKeyboardButton } from '../src/telegram/bot-api.client'
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

const FIRST_TG_ID = 800_000_001
const SECOND_TG_ID = 800_000_002
const CARD_MESSAGE_ID = 42

let firstModeratorId: number
let secondModeratorId: number

/** Клавиатура последнего `editMessageText` — то, что модератор видит после нажатия. */
function lastKeyboard(): InlineKeyboardButton[][] {
  const edits = telegram.of('editMessageText')
  const last = edits[edits.length - 1]
  const markup = last?.params['reply_markup'] as { inline_keyboard: InlineKeyboardButton[][] } | undefined
  return markup?.inline_keyboard ?? []
}

function labels(keyboard: InlineKeyboardButton[][]): string[] {
  return keyboard.flat().map((button) => button.text)
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
  firstModeratorId = await seedModerator(prisma, FIRST_TG_ID, 'Первый')
  secondModeratorId = await seedModerator(prisma, SECOND_TG_ID, 'Второй')
})

afterAll(async () => {
  await app.close()
  await telegram.close()
  await prisma.$disconnect()
})

async function press(data: string, fromId = FIRST_TG_ID): Promise<Response> {
  return postUpdate(app.baseUrl, callbackUpdate({ data, fromId, messageId: CARD_MESSAGE_ID }))
}

async function drain(): Promise<void> {
  await worker.tick()
}

describe('Одношаговые переходы (US-019, US-023)', () => {
  it('«Принять» меняет статус, пишет историю и перестраивает кнопки', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID, withReadyPhoto: true })
    await press(encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'AC' }))

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(stored.status).toBe('ACCEPTED')

    const history = await prisma.reportStatusHistory.findFirst({
      where: { reportId: report.id, toStatus: 'ACCEPTED' },
    })
    expect(history?.fromStatus).toBe('NEW')
    expect(history?.actorType).toBe('MODERATOR')
    expect(history?.moderatorId).toBe(firstModeratorId)
    expect(Number(history?.actorTelegramUserId)).toBe(FIRST_TG_ID)

    // Правка карточки ушла в очередь, а не прямым вызовом из транзакции.
    await drain()
    expect(labels(lastKeyboard())).toEqual(['В работу', 'Отклонить', 'Дубль', 'Не по силам'])
  })

  it('«В работу» и «вернуть в очередь» — один и тот же callback, разные переходы', async () => {
    const report = await seedReport(prisma, { status: 'ACCEPTED', cardMessageId: CARD_MESSAGE_ID })
    await press(encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'IP' }))
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('IN_PROGRESS')

    await press(encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'AC' }))
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('ACCEPTED')

    const history = await prisma.reportStatusHistory.findMany({ where: { reportId: report.id } })
    // Обе записи остаются: сорвавшийся выезд — часть истории, а не её правка.
    expect(history.map((row) => row.toStatus)).toEqual(['NEW', 'IN_PROGRESS', 'ACCEPTED'])
  })

  it('запрещённый переход отклоняется с текущим статусом', async () => {
    const report = await seedReport(prisma, { status: 'IN_PROGRESS', cardMessageId: CARD_MESSAGE_ID })
    // `IN_PROGRESS → IN_PROGRESS` в таблице PRD §5.1 нет.
    await press(encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'IP' }))

    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('IN_PROGRESS')
    const answer = telegram.of('answerCallbackQuery').at(-1)
    expect(String(answer?.params['text'])).toContain('уже изменён')
    expect(answer?.params['show_alert']).toBe(true)
  })

  it('терминальный статус остаётся без кнопок переходов', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    await press(encodeCallbackData({ op: 'R', n: report.publicNumber, arg: 'spam' }))
    await drain()

    expect(labels(lastKeyboard())).toEqual(['↩︎ Отменить'])
  })
})

describe('Гонка двух модераторов (US-026, PRD 5.3.6)', () => {
  it('применяется первый, второй получает «статус уже изменён»', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })

    // Оба нажали кнопку, отрисованную на состоянии `NEW`. Из `ACCEPTED` такого перехода
    // в таблице PRD §5.1 нет, поэтому второй получает отказ, а не второй переход.
    const [first, second] = await Promise.all([
      press(encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'AC' }), FIRST_TG_ID),
      press(encodeCallbackData({ op: 's', n: report.publicNumber, arg: 'AC' }), SECOND_TG_ID),
    ])
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)

    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('ACCEPTED')

    // Ровно один переход, а не два: второй `UPDATE` не нашёл ожидаемого статуса.
    const history = await prisma.reportStatusHistory.findMany({
      where: { reportId: report.id, fromStatus: 'NEW' },
    })
    expect(history).toHaveLength(1)

    const refusals = telegram
      .of('answerCallbackQuery')
      .filter((call) => String(call.params['text']).includes('уже изменён'))
    expect(refusals).toHaveLength(1)
  })

  it('условный UPDATE отклоняет второй переход, начатый до чужого коммита', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    const actor = { type: 'MODERATOR' as const, telegramUserId: BigInt(FIRST_TG_ID), moderatorId: firstModeratorId }

    // Настоящее пересечение, а не два последовательных запроса: вторая транзакция
    // читает `NEW` до того, как первая зафиксирована, и её `UPDATE` дожидается снятия
    // блокировки, чтобы обнаружить, что ожидаемого статуса больше нет (SRS §6.6).
    let release = (): void => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const first = prisma.$transaction(async (tx) => {
      const result = await applyTransition(tx, { publicNumber: report.publicNumber, to: 'ACCEPTED', actor })
      await gate
      return result
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    const second = prisma.$transaction((tx) =>
      applyTransition(tx, { publicNumber: report.publicNumber, to: 'REJECTED', reason: 'spam', actor }),
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    release()

    const [firstOutcome, secondOutcome] = await Promise.all([first, second])
    expect(firstOutcome.ok).toBe(true)
    expect(secondOutcome).toEqual({ ok: false, code: 'CHANGED', status: 'ACCEPTED' })
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('ACCEPTED')
  })
})

describe('Двухшаговые переходы с причиной (US-020, US-022, SRS §6.5)', () => {
  it('«Отклонить» заменяет кнопки причинами в том же сообщении', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    await press(encodeCallbackData({ op: 'r', n: report.publicNumber }))

    // Ни одного нового сообщения в группе — только правка существующего.
    expect(telegram.of('sendMessage')).toHaveLength(0)
    expect(telegram.of('editMessageText')).toHaveLength(1)
    expect(labels(lastKeyboard())).toEqual([
      'Не дефект покрытия',
      'Фото непригодно',
      'Спам',
      'Другое',
      '← Назад',
    ])
    // Статус не изменился: переход без причины не выполняется (PRD §5.2).
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
  })

  it('«Назад» возвращает кнопки статусов', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    await press(encodeCallbackData({ op: 'r', n: report.publicNumber }))
    await press(encodeCallbackData({ op: 'z', n: report.publicNumber }))

    expect(labels(lastKeyboard())).toEqual(['Принять', 'Отклонить', 'Дубль', 'Не по силам'])
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
  })

  it('выбранная причина выполняет переход и сохраняется в заявке и истории', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    await press(encodeCallbackData({ op: 'O', n: report.publicNumber, arg: 'utilities' }))

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(stored.status).toBe('OUT_OF_SCOPE')
    expect(stored.statusReason).toBe('utilities')

    const history = await prisma.reportStatusHistory.findFirstOrThrow({
      where: { reportId: report.id, toStatus: 'OUT_OF_SCOPE' },
    })
    expect(history.reason).toBe('utilities')
  })

  it('«другое» требует текста: до ответа перехода нет', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    await press(encodeCallbackData({ op: 'R', n: report.publicNumber, arg: 'other' }))

    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
    const prompt = await prisma.botPrompt.findFirstOrThrow()
    expect(prompt.kind).toBe('REASON_TEXT')
    expect(prompt.targetStatus).toBe('REJECTED')
    expect(prompt.moderatorId).toBe(firstModeratorId)
    // Вопрос уходит с ForceReply, чтобы ответ пришёл именно на него.
    expect(telegram.of('sendMessage').at(-1)?.params['reply_markup']).toEqual({
      force_reply: true,
      selective: true,
    })
  })

  it('на ForceReply отвечает только начавший переход', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    await press(encodeCallbackData({ op: 'R', n: report.publicNumber, arg: 'other' }))
    const prompt = await prisma.botPrompt.findFirstOrThrow()

    await postUpdate(
      app.baseUrl,
      messageUpdate({ fromId: SECOND_TG_ID, text: 'не яма', replyToMessageId: prompt.messageId }),
    )
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')

    await postUpdate(
      app.baseUrl,
      messageUpdate({ fromId: FIRST_TG_ID, text: 'разметка, а не яма', replyToMessageId: prompt.messageId }),
    )
    const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(stored.status).toBe('REJECTED')
    expect(stored.statusReason).toBe('other')
    expect(stored.statusReasonText).toBe('разметка, а не яма')
    // Prompt отработан и больше не принимает ответов.
    expect(await prisma.botPrompt.count()).toBe(0)
  })

  it('просроченный prompt отвечает «время истекло»', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    await press(encodeCallbackData({ op: 'R', n: report.publicNumber, arg: 'other' }))
    const prompt = await prisma.botPrompt.findFirstOrThrow()
    await prisma.botPrompt.update({
      where: { chatId_messageId: { chatId: prompt.chatId, messageId: prompt.messageId } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    await postUpdate(
      app.baseUrl,
      messageUpdate({ fromId: FIRST_TG_ID, text: 'поздно', replyToMessageId: prompt.messageId }),
    )
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
    await drain()
    expect(telegram.of('sendMessage').map((call) => String(call.params['text'])).join(' ')).toContain(
      'Время истекло',
    )
  })
})

describe('Дубликаты по номеру оригинала (US-021)', () => {
  async function askDuplicate(publicNumber: number): Promise<number> {
    await press(encodeCallbackData({ op: 'd', n: publicNumber }))
    const prompt = await prisma.botPrompt.findFirstOrThrow()
    expect(prompt.kind).toBe('DUPLICATE_NUMBER')
    return prompt.messageId
  }

  async function answer(messageId: number, text: string): Promise<void> {
    await postUpdate(app.baseUrl, messageUpdate({ fromId: FIRST_TG_ID, text, replyToMessageId: messageId }))
  }

  it('отклоняет номер самой заявки и несуществующий номер', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    const promptId = await askDuplicate(report.publicNumber)

    await answer(promptId, `RR-${report.publicNumber}`)
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')

    await answer(promptId, 'RR-999999')
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
    // Prompt жив: ошибка ввода не сжигает попытку.
    expect(await prisma.botPrompt.count()).toBe(1)
  })

  it('отклоняет оригинал, который сам является дубликатом', async () => {
    const original = await seedReport(prisma, {})
    const chained = await seedReport(prisma, {})
    await prisma.report.update({
      where: { id: chained.id },
      data: { status: 'DUPLICATE', duplicateOfId: original.id },
    })
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })

    const promptId = await askDuplicate(report.publicNumber)
    await answer(promptId, String(chained.publicNumber))

    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
  })

  it('принимает валидный номер и проставляет ссылку на оригинал', async () => {
    const original = await seedReport(prisma, {})
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })

    const promptId = await askDuplicate(report.publicNumber)
    await answer(promptId, String(original.publicNumber))

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(stored.status).toBe('DUPLICATE')
    expect(stored.duplicateOfId).toBe(original.id)
    const history = await prisma.reportStatusHistory.findFirstOrThrow({
      where: { reportId: report.id, toStatus: 'DUPLICATE' },
    })
    expect(history.duplicateOfId).toBe(original.id)
  })
})

describe('Окно отмены (PRD §5.4, SRS §6.10)', () => {
  async function reject(publicNumber: number): Promise<number> {
    await press(encodeCallbackData({ op: 'R', n: publicNumber, arg: 'spam' }))
    const history = await prisma.reportStatusHistory.findFirstOrThrow({
      where: { toStatus: 'REJECTED' },
      orderBy: { id: 'desc' },
    })
    return history.id
  }

  it('автор возвращает статус в течение 15 минут, и это новая строка истории', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    const historyId = await reject(report.publicNumber)

    await press(encodeCallbackData({ op: 'u', n: historyId }))

    const stored = await prisma.report.findUniqueOrThrow({ where: { id: report.id } })
    expect(stored.status).toBe('NEW')
    expect(stored.statusReason).toBeNull()

    const rows = await prisma.reportStatusHistory.findMany({
      where: { reportId: report.id },
      orderBy: { id: 'asc' },
    })
    // История не переписывается задним числом: виден и переход, и его отмена.
    expect(rows.map((row) => row.toStatus)).toEqual(['NEW', 'REJECTED', 'NEW'])
    expect(rows[1]?.undoneAt).not.toBeNull()
    expect(rows[2]?.undoesHistoryId).toBe(historyId)
  })

  it('чужой модератор отменить не может', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    const historyId = await reject(report.publicNumber)

    await press(encodeCallbackData({ op: 'u', n: historyId }), SECOND_TG_ID)

    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('REJECTED')
    const answer = telegram.of('answerCallbackQuery').at(-1)
    expect(String(answer?.params['text'])).toContain('только тот, кто сделал переход')
    expect(secondModeratorId).toBeGreaterThan(0)
  })

  it('через 16 минут кнопка исчезает, а опоздавшее нажатие отклоняется', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    const historyId = await reject(report.publicNumber)

    // Подмена времени вместо ожидания: 15 минут в тесте — это не проверка, а сон.
    await prisma.$executeRaw`
      UPDATE report_status_history SET created_at = now() - interval '16 minutes' WHERE id = ${historyId}`

    telegram.reset()
    await drain()
    // Перерисованная карточка уже без кнопки отмены — без отдельного планировщика.
    expect(lastKeyboard()).toEqual([])

    await press(encodeCallbackData({ op: 'u', n: historyId }))
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('REJECTED')
    expect(String(telegram.of('answerCallbackQuery').at(-1)?.params['text'])).toContain('Окно отмены истекло')
  })

  it('второй раз один переход не отменяется', async () => {
    const report = await seedReport(prisma, { cardMessageId: CARD_MESSAGE_ID })
    const historyId = await reject(report.publicNumber)

    await press(encodeCallbackData({ op: 'u', n: historyId }))
    await press(encodeCallbackData({ op: 'u', n: historyId }))

    const undoRows = await prisma.reportStatusHistory.findMany({ where: { undoesHistoryId: historyId } })
    expect(undoRows).toHaveLength(1)
    expect((await prisma.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('NEW')
  })
})
