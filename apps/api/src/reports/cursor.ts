import { HttpStatus } from '@nestjs/common'
import { ApiException } from '../common/api-error'

/** Позиция в списке: пара «когда создана» + «публичный номер» (SRS §4.3).
 *
 *  Keyset, а не `OFFSET`: заявки приходят непрерывно, и вставка новой строки сдвигает
 *  окно — житель увидел бы один элемент дважды или потерял его. Пара нужна потому,
 *  что `created_at` не уникален: две заявки в одну миллисекунду при всплеске реальны.
 *
 *  Разрыв ничьей — `public_number`, а не `report.id`: внутренний ключ наружу не выходит
 *  вовсе, даже в непрозрачной строке (SRS §9.2). Номер публичен по замыслу и растёт
 *  в том же порядке. */
export interface Cursor {
  createdAt: Date
  number: number
}

/** base64url, потому что курсор непрозрачен: формат меняется вместе с сортировкой,
 *  и клиент на него не завязывается. Подписи нет — подписывать нечего, внутри только
 *  публичные поля публичной заявки. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt.getTime()}.${cursor.number}`).toString('base64url')
}

export function decodeCursor(raw: string): Cursor {
  const [millis, number] = Buffer.from(raw, 'base64url').toString('utf8').split('.')
  const at = Number(millis)
  const parsed = Number(number)
  // Битый курсор — ошибка, а не молчаливый сброс на первую страницу: сброс маскирует
  // баг пагинации и превращает его в «иногда список начинается сначала».
  if (!Number.isFinite(at) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiException('INVALID_CURSOR', HttpStatus.BAD_REQUEST, 'cursor is not a keyset position')
  }
  return { createdAt: new Date(at), number: parsed }
}
