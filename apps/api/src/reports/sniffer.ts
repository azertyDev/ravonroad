import type { AcceptedPhotoMimeType } from '@ravonroad/shared-types'

/** Определение формата по первым байтам файла (SRS §5.3 п.2).
 *
 *  Заголовок `Content-Type` и расширение не учитываются **вообще**: их пишет клиент,
 *  а клиенту сервер не верит. Полиглот «JPEG + HTML» отличается от картинки как раз
 *  тем, что заявляет о себе неправду.
 *
 *  Список — белый, а не чёрный: неизвестный формат отклоняется. Чёрный список пришлось
 *  бы пополнять каждым новым способом обмануть парсер, а белый закрывает их все сразу.
 *  SVG поэтому не принимается ни на каком этапе — его рендер это исполнение чужой
 *  разметки (SRS §9.6). HEIC тоже: сборка sharp без libheif его не декодирует,
 *  а клиент конвертирует его в JPEG ещё в браузере (SRS §5.2). */

const JPEG = [0xff, 0xd8, 0xff]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const RIFF = [0x52, 0x49, 0x46, 0x46]
const WEBP = [0x57, 0x45, 0x42, 0x50]

/** Достаточно 12 байт: дальше начинается содержимое, а не признак формата. */
export const SNIFF_LENGTH = 12

function startsWith(buffer: Buffer, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false
  return signature.every((byte, index) => buffer[offset + index] === byte)
}

export function sniffImageType(buffer: Buffer): AcceptedPhotoMimeType | null {
  if (startsWith(buffer, JPEG)) return 'image/jpeg'
  if (startsWith(buffer, PNG)) return 'image/png'
  // WebP — контейнер RIFF: без второй проверки под него подошёл бы любой WAV или AVI.
  if (startsWith(buffer, RIFF) && startsWith(buffer, WEBP, 8)) return 'image/webp'
  return null
}
