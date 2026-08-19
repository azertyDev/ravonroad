import { ConfigService } from '@nestjs/config'
import type { CreateReportResponse } from '@ravonroad/shared-types'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PhotoWorker } from '../src/media/photo.worker'
import { ProcessService } from '../src/media/process.service'
import { PhotoStorage } from '../src/media/photo-storage'
import { startTestApp, type TestApp } from './support/app'
import { createTestPrisma, truncateData } from './support/database'
import { makeJpeg } from './support/photos'
import { submitReport } from './support/report-request'

const prisma = createTestPrisma()
let app: TestApp
let worker: PhotoWorker
let jpeg: Buffer
/** Второе изображение отличается размером, а значит и итоговыми байтами: две разные
 *  фотографии в одной заявке — обычный случай, одинаковые проверяются отдельно. */
let otherJpeg: Buffer

/** Воркер собирается руками, а не берётся из приложения: тест гоняет его шагами.
 *  Ждать секундного таймера значило бы мерить сон, а не поведение очереди. */
function buildWorker(): PhotoWorker {
  const photos = new PhotoStorage(new ConfigService())
  return new PhotoWorker(prisma, new ProcessService(photos), photos, new ConfigService())
}

async function drain(): Promise<number> {
  let processed = 0
  while (await worker.tick()) processed += 1
  return processed
}

beforeAll(async () => {
  // Приложение поднимается с остановленной обработкой: заявка обязана приниматься
  // и при неработающем воркере, и это состояние по умолчанию для всего файла (AC-5).
  process.env['PHOTO_WORKERS'] = '0'
  app = await startTestApp()
  jpeg = await makeJpeg(2400, 1800)
  otherJpeg = await makeJpeg(2000, 1500, 200)
  worker = buildWorker()
})

beforeEach(async () => {
  await truncateData(prisma)
  app.storage.objects.clear()
  app.storage.failing = false
})

afterAll(async () => {
  await app.close()
  await prisma.$disconnect()
  delete process.env['PHOTO_WORKERS']
})

describe('Photo-воркер (SRS §5.4, ADR-0007)', () => {
  it('принимает заявку при остановленном воркере', async () => {
    const response = await submitReport(app, { photos: [jpeg] })
    expect(response.status).toBe(201)
    expect(((await response.json()) as CreateReportResponse).photosPending).toBe(true)

    const photos = await prisma.reportPhoto.findMany()
    expect(photos.map((photo) => photo.state)).toEqual(['PENDING'])
  })

  it('догоняет очередь после запуска и доводит фотографии до READY', async () => {
    await submitReport(app, { photos: [jpeg, otherJpeg] })
    expect(await drain()).toBe(2)

    const photos = await prisma.reportPhoto.findMany()
    for (const photo of photos) {
      expect(photo.state).toBe('READY')
      expect(photo.objectKey).toMatch(/^photos\/[0-9a-f]{2}\//)
      expect(photo.previewKey).toMatch(/_400\.jpg$/)
      expect(photo.sha256).toHaveLength(64)
      expect(photo.width).toBe(1600)
      // Сырой объект удалён: он был буфером между запросом и воркером, не архивом.
      expect(photo.rawKey).toBeNull()
    }
    expect(app.storage.objects.size).toBe(2 * 2)
  })

  it('не выдаёт одну задачу двум проходам', async () => {
    // Обработка длится дольше секундного опроса — это норма, а не сбой, и вторая
    // выдача той же строки означала бы две загрузки одного файла.
    await submitReport(app, { photos: [jpeg] })

    const [first, second] = await Promise.all([worker.tick(0), worker.tick(1)])
    expect([first, second].filter(Boolean)).toHaveLength(1)
    expect(await prisma.reportPhoto.count({ where: { state: 'READY' } })).toBe(1)
  })

  it('после пяти неудач уводит фото в FAILED, оставляя заявку видимой', async () => {
    await submitReport(app, { photos: [jpeg] })
    const reportId = (await prisma.report.findFirstOrThrow({ select: { id: true } })).id

    app.storage.failing = true
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      // Аренда прячет задачу на пять минут, поэтому перед каждой попыткой она
      // возвращается в очередь: тест проверяет счётчик попыток, а не таймер.
      await prisma.reportPhoto.updateMany({ data: { nextAttemptAt: new Date(0) } })
      expect(await worker.tick(), `попытка ${attempt}`).toBe(true)
    }

    const photo = await prisma.reportPhoto.findFirstOrThrow()
    expect(photo.state).toBe('FAILED')
    expect(photo.attempts).toBe(5)
    expect(photo.lastError).not.toBeNull()

    // FAILED — терминальное состояние фотографии, но не заявки: потерять заявку
    // из-за неудачного ресайза нельзя (SRS §5.4).
    const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } })
    expect(report.status).toBe('NEW')
  })

  it('откладывает повтор, а не крутит неудачу в тесном цикле', async () => {
    await submitReport(app, { photos: [jpeg] })
    app.storage.failing = true
    await worker.tick()

    const photo = await prisma.reportPhoto.findFirstOrThrow()
    expect(photo.state).toBe('PENDING')
    expect(photo.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
    // Задача не видна очереди до срока: следующий проход не возьмёт ничего.
    expect(await worker.tick()).toBe(false)
  })

  it('обрабатывает заявки в порядке постановки', async () => {
    await submitReport(app, { photos: [jpeg] })
    await submitReport(app, { photos: [jpeg] })

    const queued = await prisma.reportPhoto.findMany({ orderBy: { id: 'asc' }, select: { id: true } })
    await worker.tick()

    const first = await prisma.reportPhoto.findUniqueOrThrow({ where: { id: queued[0]?.id ?? 0 } })
    // Приоритетов у фотографий нет: при всплеске справедливее обработать заявку,
    // поданную первой, чем ту, у которой меньше файлов (SRS §5.4).
    expect(first.state).toBe('READY')
  })

  it('сводит один и тот же файл, приложенный дважды, к одной фотографии', async () => {
    // Совпадение выясняется только после перекодирования: на приёме sha256 итоговых
    // байт ещё не существует. Правильный исход — одна фотография, а не ошибка.
    await submitReport(app, { photos: [jpeg, jpeg] })
    await drain()

    const photos = await prisma.reportPhoto.findMany()
    expect(photos).toHaveLength(1)
    expect(photos[0]?.state).toBe('READY')
    expect(await prisma.report.count()).toBe(1)
  })

  it('дедуплицирует одинаковые фотографии разных заявок по содержимому', async () => {
    await submitReport(app, { photos: [jpeg] })
    await submitReport(app, { photos: [jpeg] })
    await drain()

    const photos = await prisma.reportPhoto.findMany({ select: { sha256: true, objectKey: true } })
    expect(new Set(photos.map((photo) => photo.sha256)).size).toBe(1)
    // Один объект и одно превью на два фото: ключ определяется содержимым,
    // а связь «фото ↔ заявка» живёт в БД (SRS §5.5).
    expect(app.storage.objects.size).toBe(2)
  })
})
