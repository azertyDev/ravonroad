import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import { photoKey, previewKey } from './object-keys'
import { S3Service } from './s3.service'

/** Длинная сторона итогового изображения (PRD §7.1). */
const FULL_SIZE = 1600
/** Превью для списка, кластеров и карточки. */
const PREVIEW_SIZE = 400

const FULL_QUALITY = 82
const PREVIEW_QUALITY = 75

/** Защита от «бомб»: файл 10 000 × 10 000 весит 200 КБ и разворачивается в гигабайты
 *  (SRS §5.3 п.4). Лимит стоит на входе декодера, а не на размере файла. */
const LIMIT_INPUT_PIXELS = 50_000_000

/** libvips не поднимает пул потоков и держит кэш в 32 МБ вместо 50 по умолчанию.
 *  Бюджет процесса — 576 МБ на проде и 256 МБ на dev, и sharp в нём гость, а не хозяин
 *  (SRS §5.7). Настройка глобальная, поэтому выполняется один раз при загрузке модуля. */
sharp.concurrency(1)
sharp.cache({ memory: 32 })

export interface ProcessedPhoto {
  /** Хеш **итоговых** байт: он же ключ, он же дедупликация (SRS §5.5). */
  sha256: string
  objectKey: string
  previewKey: string
  width: number
  height: number
  bytes: number
}

@Injectable()
export class ProcessService {
  constructor(private readonly s3: S3Service) {}

  /** Перекодирует сырое изображение и кладёт результат под контент-адресуемые ключи.
   *
   *  Перекодирование обязательно, а не желательно: полиглот «JPEG + HTML» перестаёт
   *  быть полиглотом только после того, как его пиксели прошли через декодер и энкодер,
   *  и исходные байты не сохраняются нигде (SRS §9.6).
   *
   *  EXIF вырезается тем, что sharp по умолчанию **не переносит** метаданные в результат:
   *  вместе с ним уходят GPS, модель камеры, дата съёмки и серийный номер.
   *  `.withMetadata()` в проекте запрещён — он вернул бы всё это обратно.
   *
   *  `.rotate()` вызывается до `resize` и применяет ориентацию к пикселям, поэтому после
   *  удаления тега ориентации фотография не переворачивается (PRD §7.1). */
  async process(rawKey: string): Promise<ProcessedPhoto> {
    const raw = await this.s3.getObject(rawKey)

    const pipeline = sharp(raw, { limitInputPixels: LIMIT_INPUT_PIXELS }).rotate()
    const full = await pipeline
      .clone()
      .resize({ width: FULL_SIZE, height: FULL_SIZE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: FULL_QUALITY, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })

    const preview = await pipeline
      .clone()
      .resize({ width: PREVIEW_SIZE, height: PREVIEW_SIZE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: PREVIEW_QUALITY, mozjpeg: true })
      .toBuffer()

    // Хеш считается по итоговым байтам, а не по исходнику: у двух жителей, снявших одну
    // яму, исходники разные, а у одного файла, доставленного дважды, байты совпадают
    // именно после нормализации (SRS §5.3).
    const sha256 = createHash('sha256').update(full.data).digest('hex')
    const objectKey = photoKey(sha256)
    const preview400 = previewKey(sha256)

    // Ключ определяется содержимым, поэтому существующий объект — те же самые байты.
    // Пропуск загрузки экономит две операции на каждом повторно присланном файле.
    if (!(await this.s3.exists(objectKey))) {
      await this.s3.putImage(objectKey, full.data)
      await this.s3.putImage(preview400, preview)
    }

    return {
      sha256,
      objectKey,
      previewKey: preview400,
      width: full.info.width,
      height: full.info.height,
      bytes: full.info.size,
    }
  }
}
