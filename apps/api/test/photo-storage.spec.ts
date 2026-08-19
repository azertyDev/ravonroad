import { readdirSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { ConfigService } from '@nestjs/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { incomingKey, photoKey, previewKey } from '../src/media/object-keys'
import { PhotoStorage } from '../src/media/photo-storage'
import { applyStorageEnv, startFakeStorage, type FakeStorage } from './support/storage'

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

let storage: FakeStorage
let photos: PhotoStorage

beforeAll(async () => {
  storage = await startFakeStorage()
  applyStorageEnv(storage)
  // Публичный адрес ставит тот, кто поднимает приложение; здесь приложения нет,
  // а ссылки проверяются — значит ставим сами.
  process.env['PUBLIC_SITE_URL'] = 'http://localhost'
  photos = new PhotoStorage(new ConfigService())
  await photos.onModuleInit()
})

afterAll(async () => {
  await storage.close()
})

describe('PhotoStorage (SRS §5.5, ADR-0009)', () => {
  it('кладёт сырые байты в incoming/ и читает их обратно', async () => {
    const key = incomingKey()
    const body = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02])

    await photos.putRaw(key, body)
    expect(await photos.getObject(key)).toEqual(body)
  })

  it('раскладывает итоговое изображение по контент-адресуемому пути', async () => {
    await photos.putImage(photoKey(SHA), Buffer.from('jpeg'))
    expect(storage.objects.has(`photos/a1/${SHA}.jpg`)).toBe(true)
  })

  it('кладёт превью отдельным ключом того же префикса', async () => {
    await photos.putImage(previewKey(SHA), Buffer.from('preview'))
    expect(storage.objects.has(`photos/a1/${SHA}_400.jpg`)).toBe(true)
  })

  it('не оставляет промежуточных файлов после записи', async () => {
    await photos.putImage(photoKey(SHA), Buffer.from('jpeg'))
    // Запись идёт через временный файл и rename. Останься он на диске — том с фотографиями
    // тихо наполнялся бы мусором, который не видно ни в одной ссылке.
    expect(readdirSync(join(storage.root, '.tmp'))).toHaveLength(0)
  })

  it('отвечает существованием файла, а не исключением', async () => {
    expect(await photos.exists(photoKey(SHA))).toBe(true)
    expect(await photos.exists('photos/zz/missing.jpg')).toBe(false)
  })

  it('удаляет объект и молчит на повторном удалении', async () => {
    const key = incomingKey()
    await photos.putRaw(key, Buffer.from('raw'))
    await photos.deleteObject(key)
    expect(storage.objects.has(key)).toBe(false)
    // Воркер удаляет сырьё после обработки, сборщик — по возрасту. Оба могут добраться
    // до одного файла: второй обязан промолчать, а не уронить проход.
    await expect(photos.deleteObject(key)).resolves.toBeUndefined()
  })

  it('отвергает ключ, уводящий за пределы MEDIA_ROOT', async () => {
    // Ключи приходят из object-keys.ts и снаружи не управляются, но это граница между
    // базой и файловой системой: `../` в ключе превратил бы удаление фотографии
    // в удаление чего угодно на диске.
    // Две разные защиты, и обе обязаны стоять: первая отсекает ключ по набору символов,
    // вторая — уже разрешённый путь, вышедший за корень. Одной хватило бы ровно до дня,
    // когда набор символов расширят.
    await expect(photos.deleteObject('../../etc/passwd')).rejects.toThrow(/недопустимый ключ/)
    await expect(photos.getObject('photos/../../etc/passwd')).rejects.toThrow(/за пределы MEDIA_ROOT/)
  })

  it('строит публичный адрес на своём origin, без двойного слэша', () => {
    expect(photos.publicUrl(photoKey(SHA))).toBe(`${storage.publicBaseUrl}/photos/a1/${SHA}.jpg`)
    expect(photos.publicUrl(photoKey(SHA))).not.toContain('//photos')
  })

  it('пробрасывает недоступность хранилища наружу, а не глотает её', async () => {
    // Молча проглоченная ошибка означала бы заявку со строкой фото, которой нет на диске:
    // воркер потом ходил бы за ней вечно (SRS §4.2, 503 STORAGE_UNAVAILABLE).
    storage.failing = true
    await expect(photos.putRaw(incomingKey(), Buffer.from('raw'))).rejects.toThrow()
    expect(await photos.writable()).toBe(false)
    storage.failing = false
    expect(await photos.writable()).toBe(true)
  })

  it('подметает сырьё старше срока и не трогает свежее', async () => {
    const stale = incomingKey()
    const fresh = incomingKey()
    await photos.putRaw(stale, Buffer.from('old'))
    await photos.putRaw(fresh, Buffer.from('new'))

    const day = 24 * 60 * 60 * 1000
    const past = new Date(Date.now() - 2 * day)
    utimesSync(join(storage.root, stale), past, past)

    expect(await photos.sweepIncoming(day)).toBe(1)
    expect(storage.objects.has(stale)).toBe(false)
    // Свежий файл — это фотография, за которой воркер ещё вернётся. Подмести его значило бы
    // превратить восстановимую ошибку в потерянный снимок.
    expect(storage.objects.has(fresh)).toBe(true)
  })

  it('сообщает свободное место', async () => {
    const free = await photos.freeBytes()
    expect(free).not.toBeNull()
    expect(free ?? 0).toBeGreaterThan(0)
  })
})
