import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/** Ключ неизменен по построению — он и есть хеш содержимого, — поэтому год кэша
 *  и `immutable`: браузер не станет перепроверять то, что не может измениться. */
const IMMUTABLE = 'public, max-age=31536000, immutable'

/** `inline`, а не `attachment`: фотография показывается на странице, а не скачивается. */
const INLINE = 'inline'

@Injectable()
export class S3Service {
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicBaseUrl: string

  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET')
    this.publicBaseUrl = config.getOrThrow<string>('S3_PUBLIC_BASE_URL').replace(/\/+$/, '')
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      region: config.getOrThrow<string>('S3_REGION'),
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
      // Путевой стиль работает у всех S3-совместимых хранилищ, включая GCS; виртуальные
      // хосты требуют от провайдера wildcard-сертификата и совпадения имени бакета
      // с DNS-именем. Ради одного вида адреса менять хранилище не хочется.
      forcePathStyle: true,
    })
  }

  /** Сырые байты в `incoming/`. Один вызов, ноль процессорного времени: всё, что стоит
   *  тактов, происходит после ответа клиенту (SRS §5.3 п.6). Тип содержимого здесь тот,
   *  что определил sniffer по magic bytes, а не тот, что заявил клиент. */
  async putRaw(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    )
  }

  /** Итоговое изображение или превью. Всегда JPEG: всё перекодировано, исходные байты
   *  не сохраняются нигде (SRS §9.6). */
  async putImage(key: string, body: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: 'image/jpeg',
        CacheControl: IMMUTABLE,
        ContentDisposition: INLINE,
      }),
    )
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    if (response.Body === undefined) throw new Error(`s3 object ${key} has no body`)
    return Buffer.from(await response.Body.transformToByteArray())
  }

  /** Ключ содержит хеш содержимого, поэтому существующий объект — это ровно те же байты.
   *  Проверка экономит загрузку при повторе одного и того же файла. */
  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return true
    } catch {
      return false
    }
  }

  /** `HEAD` бакета для `/health/details` (SRS §10.1): проверяется доступность хранилища
   *  целиком, а не конкретного объекта, — иначе диагностика зависела бы от того, лежит ли
   *  в бакете именно та фотография, которую мы решили спросить. */
  async bucketReachable(): Promise<boolean> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
      return true
    } catch {
      return false
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  /** Чтение публичное и идёт мимо нас: отдельный домен бакета снимает с приложения
   *  раздачу файлов, а с браузера — исполнение чужого содержимого на нашем origin
   *  (SRS §9.6). Запись — только серверными ключами, presigned upload не используется. */
  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`
  }
}
