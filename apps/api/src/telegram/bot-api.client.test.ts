import { describe, expect, it } from 'vitest'
import { BotApiError } from './bot-api.client'

describe('классификация отказов Bot API (SRS §6.7)', () => {
  it('считает мёртвым вызовом только удалённое сообщение, закрытый чат и выкинутого бота', () => {
    expect(new BotApiError('message to edit not found', 400, null).permanent).toBe(true)
    expect(new BotApiError('bot was kicked', 403, null).permanent).toBe(true)
    expect(new BotApiError('chat not found', 404, null).permanent).toBe(true)
  })

  it('не закрывает запись на неверном токене: это настройка, а не мёртвый вызов', () => {
    // Иначе каждая карточка кампании молча уходила бы в last_error до тех пор, пока
    // кто-нибудь не заметит, что токен протух.
    expect(new BotApiError('Unauthorized: invalid token specified', 401, null).permanent).toBe(false)
  })

  it('не закрывает запись на сбое сети и на 5xx', () => {
    expect(new BotApiError('fetch failed', 0, null).permanent).toBe(false)
    expect(new BotApiError('Bad Gateway', 502, null).permanent).toBe(false)
  })

  it('429 — это расписание, а не ошибка: попытка не засчитывается', () => {
    const error = new BotApiError('Too Many Requests', 429, 30)
    expect(error.permanent).toBe(false)
    expect(error.retryAfter).toBe(30)
  })
})
