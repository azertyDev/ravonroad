import { MAX_PHOTO_BYTES } from '@ravonroad/shared-types'
import { fitWithin, TARGET_LONG_SIDE } from './scale'

/** До сжатия принимаем до 10 МБ (PRD §7.1): столько весит кадр современного телефона.
 *  После сжатия файл обязан уложиться в серверный предел, иначе отправка вернёт 413. */
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024

/** 0.82 — точка, после которой на фотографии ямы уже не видно разницы, а вес растёт. */
const JPEG_QUALITY = 0.82

export type PhotoRejection = 'TOO_LARGE' | 'STILL_TOO_LARGE' | 'DECODE_FAILED'

export interface CompressedPhoto {
  blob: Blob
  width: number
  height: number
  /** Имя нужно серверу только для журнала; расширение он игнорирует (SRS §5.3). */
  name: string
}

export type CompressResult =
  | { ok: true; photo: CompressedPhoto }
  | { ok: false; reason: PhotoRejection; bytes: number }

/** Уменьшает и перекодирует фотографию **на устройстве**, до отправки (SRS §5.2).
 *
 *  Исходный кадр с телефона — 3–6 МБ, после обработки 150–350 КБ. Мобильный трафик
 *  в Узбекистане платный, и разница здесь — это деньги жителя, а не наша экономия
 *  на канале.
 *
 *  `imageOrientation: 'from-image'` применяет поворот к пикселям. Именно поэтому
 *  фотография не переворачивается после того, как сервер вырежет EXIF: тега ориентации
 *  к тому моменту уже нечего терять (PRD §7.1).
 *
 *  HEIC: на iOS его декодирует системный кодек, и файл проходит. Вне iOS
 *  `createImageBitmap` отклоняет промис — показываем понятную ошибку и предлагаем
 *  снять заново. Библиотеку-конвертер не подключаем: ~1,5 МБ wasm при бюджете
 *  страницы 700 КБ — это весь бюджет ради редкого случая (SRS §5.2). */
export async function compressPhoto(file: File): Promise<CompressResult> {
  if (file.size > MAX_SOURCE_BYTES) return { ok: false, reason: 'TOO_LARGE', bytes: file.size }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // Ошибка декодирования одного файла не отменяет остальные: решение принимает
    // вызывающий, а этот файл просто выбывает.
    return { ok: false, reason: 'DECODE_FAILED', bytes: file.size }
  }

  try {
    const size = fitWithin({ width: bitmap.width, height: bitmap.height }, TARGET_LONG_SIDE)
    const canvas = new OffscreenCanvas(size.width, size.height)
    const context = canvas.getContext('2d')
    if (context === null) return { ok: false, reason: 'DECODE_FAILED', bytes: file.size }

    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })

    if (blob.size > MAX_PHOTO_BYTES) {
      return { ok: false, reason: 'STILL_TOO_LARGE', bytes: blob.size }
    }

    return {
      ok: true,
      photo: { blob, width: size.width, height: size.height, name: toJpegName(file.name) },
    }
  } finally {
    // Декодированный кадр 1600 × 1200 — это ~7,7 МБ; на телефоне три таких кадра
    // в памяти сразу заметны.
    bitmap.close()
  }
}

function toJpegName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  return `${base === '' ? 'photo' : base}.jpg`
}
