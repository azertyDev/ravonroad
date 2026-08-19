import { createHash } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { incomingKey } from '../src/media/object-keys'
import { ProcessService } from '../src/media/process.service'
import { PhotoStorage } from '../src/media/photo-storage'
import { applyStorageEnv, startFakeStorage, type FakeStorage } from './support/storage'
import { makeJpeg, makeJpegWithExif } from './support/photos'

let storage: FakeStorage
let processor: ProcessService
let photos: PhotoStorage

async function upload(bytes: Buffer): Promise<string> {
  const key = incomingKey()
  await photos.putRaw(key, bytes)
  return key
}

beforeAll(async () => {
  storage = await startFakeStorage()
  applyStorageEnv(storage)
  // Ссылки на фотографии собираются из адреса сайта; приложения здесь нет, ставим сами.
  process.env['PUBLIC_SITE_URL'] = 'http://localhost'
  photos = new PhotoStorage(new ConfigService())
  await photos.onModuleInit()
  processor = new ProcessService(photos)
})

afterAll(async () => {
  await storage.close()
})

describe('ProcessService (SRS §5.3, §9.6)', () => {
  it('уменьшает 4000 px до 1600 px и отдаёт JPEG', async () => {
    const key = await upload(await makeJpeg(4000, 3000))
    const result = await processor.process(key)

    expect(Math.max(result.width, result.height)).toBe(1600)
    expect(result.bytes).toBeGreaterThan(0)

    const stored = storage.objects.get(result.objectKey)
    expect(stored).toBeDefined()
    expect((await sharp(stored).metadata()).format).toBe('jpeg')
  })

  it('не находит в итоговом файле ни одного тега EXIF, включая GPS', async () => {
    const key = await upload(await makeJpegWithExif())
    const result = await processor.process(key)

    const metadata = await sharp(storage.objects.get(result.objectKey)).metadata()
    // sharp по умолчанию не переносит метаданные; вместе с ними уходят GPS, модель
    // камеры и дата съёмки — то, ради чего EXIF и вырезается (PRD §7.1).
    expect(metadata.exif).toBeUndefined()
    expect(metadata.xmp).toBeUndefined()
    expect(metadata.icc).toBeUndefined()
  })

  it('кладёт превью 400 px рядом с полным изображением', async () => {
    const key = await upload(await makeJpeg(2000, 1000))
    const result = await processor.process(key)

    const preview = await sharp(storage.objects.get(result.previewKey)).metadata()
    expect(Math.max(preview.width, preview.height)).toBe(400)
    expect(result.previewKey).not.toBe(result.objectKey)
  })

  it('не увеличивает фотографию, которая меньше 1600 px', async () => {
    const key = await upload(await makeJpeg(300, 200))
    const result = await processor.process(key)
    expect(result.width).toBe(300)
    expect(result.height).toBe(200)
  })

  it('делает ключ равным sha256 итоговых байт', async () => {
    const key = await upload(await makeJpeg(800, 600))
    const result = await processor.process(key)

    const stored = storage.objects.get(result.objectKey)
    expect(stored).toBeDefined()
    expect(createHash('sha256').update(stored ?? Buffer.alloc(0)).digest('hex')).toBe(result.sha256)
    expect(result.objectKey).toBe(`photos/${result.sha256.slice(0, 2)}/${result.sha256}.jpg`)
  })

  it('не перезаписывает то, что уже лежит под этим ключом', async () => {
    // Ключ определяется содержимым, поэтому вторая запись положила бы те же байты
    // поверх тех же байт. На диске это видно по времени изменения файла: оно обязано
    // остаться прежним, иначе каждый повторно присланный снимок переписывает сам себя.
    const source = await makeJpeg(900, 700)
    const first = await processor.process(await upload(source))
    const file = join(storage.root, first.objectKey)
    const writtenAt = statSync(file).mtimeMs

    await new Promise((resolve) => setTimeout(resolve, 10))
    const second = await processor.process(await upload(source))

    expect(statSync(file).mtimeMs).toBe(writtenAt)
    expect(second.objectKey).toBe(first.objectKey)
  })

  it('отклоняет декомпрессионную бомбу вместо того, чтобы её разворачивать', async () => {
    // 12 000 × 12 000 однотонных пикселей — это 144 млн пикселей при крошечном файле.
    const bomb = await sharp({
      create: { width: 12_000, height: 12_000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png({ compressionLevel: 9 })
      .toBuffer()

    const key = await upload(bomb)
    await expect(processor.process(key)).rejects.toThrow(/pixels|limit/i)
  })

  it('не принимает файл, который не изображение', async () => {
    const key = await upload(Buffer.from('%PDF-1.7 definitely not an image'))
    await expect(processor.process(key)).rejects.toThrow()
  })
})
