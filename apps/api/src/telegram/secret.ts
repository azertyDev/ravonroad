import { timingSafeEqual } from 'node:crypto'

/** Проверка заголовка `X-Telegram-Bot-Api-Secret-Token` (SRS §6.2, §9.3).
 *
 *  Webhook — единственный `POST`, принимающий команды на изменение данных без участия
 *  пользователя, и он же самая ценная цель: без этой проверки любой, кто узнал URL,
 *  меняет статусы чужих заявок.
 *
 *  Сравнение `timingSafeEqual`, а не `===`: посимвольное сравнение отвечает тем быстрее,
 *  чем раньше расходятся строки, и по времени ответа секрет подбирается побайтово.
 *  Длины сверяются заранее, потому что `timingSafeEqual` на буферах разной длины бросает
 *  исключение, а не возвращает `false`. */
export function isValidWebhookSecret(received: string | undefined, expected: string): boolean {
  if (typeof received !== 'string' || expected === '') return false

  const a = Buffer.from(received, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  // Разная длина — уже несовпадение, и утечки здесь нет: длину секрета атакующий
  // и так узнаёт по документации Telegram, а не по нашему ответу.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
