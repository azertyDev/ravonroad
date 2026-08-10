import { ConfigService } from '@nestjs/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { incomingKey, photoKey, previewKey } from '../src/media/object-keys'
import { S3Service } from '../src/media/s3.service'
import { applyStorageEnv, startFakeStorage, type FakeStorage } from './support/storage'

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

let storage: FakeStorage
let s3: S3Service

beforeAll(async () => {
  storage = await startFakeStorage()
  applyStorageEnv(storage)
  s3 = new S3Service(new ConfigService())
})

afterAll(async () => {
  await storage.close()
})

describe('S3Service (SRS §5.5)', () => {
  it('кладёт сырые байты в incoming/ и читает их обратно', async () => {
    const key = incomingKey()
    const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02])

    await s3.putRaw(key, body, 'image/jpeg')
    expect(await s3.getObject(key)).toEqual(body)

    const put = storage.requests.find((request) => request.method === 'PUT' && request.path.endsWith(key))
    expect(put?.path).toBe(`/${storage.bucket}/${key}`)
    // Подпись SigV4 стоит на запросе: запись в бакет идёт только серверными ключами,
    // presigned upload не используется ни на каком этапе.
    expect(put?.authorization).toMatch(/^AWS4-HMAC-SHA256 /)
  })

  it('выставляет на итоговом изображении immutable и inline', async () => {
    const key = photoKey(SHA)
    await s3.putImage(key, Buffer.from('jpeg'))

    const put = storage.requests.find((request) => request.method === 'PUT' && request.path.endsWith(key))
    expect(put?.path).toBe(`/${storage.bucket}/photos/a1/${SHA}.jpg`)
    expect(put?.contentType).toBe('image/jpeg')
    // Ключ — это хеш содержимого, поэтому объект по нему не может измениться,
    // и год кэша с immutable здесь не оптимизм, а факт.
    expect(put?.cacheControl).toBe('public, max-age=31536000, immutable')
    expect(put?.contentDisposition).toBe('inline')
  })

  it('кладёт превью отдельным ключом того же префикса', async () => {
    await s3.putImage(previewKey(SHA), Buffer.from('preview'))
    expect(storage.objects.has(`photos/a1/${SHA}_400.jpg`)).toBe(true)
  })

  it('отвечает на HEAD существованием объекта, а не исключением', async () => {
    expect(await s3.exists(photoKey(SHA))).toBe(true)
    expect(await s3.exists('photos/zz/missing.jpg')).toBe(false)
  })

  it('удаляет объект', async () => {
    const key = incomingKey()
    await s3.putRaw(key, Buffer.from('raw'), 'image/jpeg')
    await s3.deleteObject(key)
    expect(storage.objects.has(key)).toBe(false)
  })

  it('строит публичный адрес без двойного слэша', async () => {
    expect(s3.publicUrl(photoKey(SHA))).toBe(`${storage.publicBaseUrl}/photos/a1/${SHA}.jpg`)
    expect(s3.publicUrl(photoKey(SHA))).not.toContain('//photos')
  })

  it('пробрасывает недоступность хранилища наружу, а не глотает её', async () => {
    // Молча проглоченная ошибка означала бы заявку со строкой фото, которой нет
    // в бакете: воркер потом ходил бы за ней вечно (SRS §4.2, 503 STORAGE_UNAVAILABLE).
    storage.failing = true
    await expect(s3.putRaw(incomingKey(), Buffer.from('raw'), 'image/jpeg')).rejects.toThrow()
    storage.failing = false
  })
})
