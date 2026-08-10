import { describe, expect, it } from 'vitest'
import { incomingKey, photoKey, previewKey } from './object-keys'

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

describe('object-keys (SRS §5.5)', () => {
  it('кладёт сырые байты под случайный ключ в incoming/', () => {
    const keys = new Set(Array.from({ length: 100 }, incomingKey))
    expect(keys.size).toBe(100)
    for (const key of keys) expect(key.startsWith('incoming/')).toBe(true)
  })

  it('адресует итоговое изображение содержимым и разбрасывает по 256 префиксам', () => {
    expect(photoKey(SHA)).toBe(`photos/a1/${SHA}.jpg`)
    expect(previewKey(SHA)).toBe(`photos/a1/${SHA}_400.jpg`)
  })

  it('не помещает в ключ идентификатор заявки', () => {
    // Иначе одно и то же фото на двух заявках хранилось бы дважды, а дедупликация
    // превратилась бы в отдельную таблицу хешей.
    expect(photoKey(SHA)).toBe(photoKey(SHA))
    expect(photoKey(SHA)).not.toContain('report')
  })

  it('даёт превью и полное изображение разные ключи при одном содержимом', () => {
    expect(photoKey(SHA)).not.toBe(previewKey(SHA))
  })
})
