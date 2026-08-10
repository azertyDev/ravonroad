import { HttpStatus, Injectable } from '@nestjs/common'
import {
  MAX_PHOTOS_PER_REPORT,
  type CreateReportResponse,
  type FieldError,
} from '@ravonroad/shared-types'
import { ApiException } from '../common/api-error'
import { DuplicatesService } from '../geo/duplicates.service'
import { GeoService } from '../geo/geo.service'
import { incomingKey } from '../media/object-keys'
import { S3Service } from '../media/s3.service'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateReportInput } from './create-report.input'
import { sniffImageType } from './sniffer'
import { generateTrackingToken } from './tracking-token'

/** Файл, как его отдаёт multer. Объявлен здесь, а не взят из `@types/multer`: нужны
 *  ровно байты и размер, и ради двух полей ставить пакет типов незачем. */
export interface UploadedPhoto {
  buffer: Buffer
  size: number
}

export interface CreateReportContext {
  idempotencyKey: string
  clientIp: string | null
}

/** Номер показывается человеку только так: `RR-` — часть контракта, а не строка локали
 *  (SRS §4.2). Считает его сервер, иначе две локали фронта разъедутся между собой. */
export function displayNumber(publicNumber: number): string {
  return `RR-${publicNumber}`
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly duplicates: DuplicatesService,
    private readonly s3: S3Service,
  ) {}

  /** Порядок шагов жёсткий и повторяет SRS §5.3: сначала то, что ничего не стоит,
   *  потом геозабор, и только потом байты в хранилище. Заявка вне города не должна
   *  стоить нам ни одного объекта в бакете.
   *
   *  Ни одного вызова sharp здесь нет и быть не может (ADR-0007): всё, что стоит
   *  процессорного времени, происходит после ответа клиенту. */
  async create(
    input: CreateReportInput,
    photos: UploadedPhoto[],
    context: CreateReportContext,
  ): Promise<CreateReportResponse> {
    if (photos.length === 0) {
      throw new ApiException('PHOTOS_REQUIRED', HttpStatus.BAD_REQUEST, 'at least one photo is required')
    }
    if (photos.length > MAX_PHOTOS_PER_REPORT) {
      throw new ApiException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        `at most ${MAX_PHOTOS_PER_REPORT} photos are accepted`,
        [{ field: 'photos', code: 'TOO_MANY' }],
      )
    }

    // Тип определяется по байтам, а не по заголовку от клиента (SRS §5.3 п.2).
    const sniffed = photos.map((photo) => sniffImageType(photo.buffer))
    if (sniffed.some((type) => type === null)) {
      throw new ApiException(
        'UNSUPPORTED_MEDIA_TYPE',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'only JPEG, PNG and WebP are accepted',
      )
    }

    const category = await this.prisma.category.findFirst({
      where: { code: input.categoryCode, isActive: true },
      select: { id: true },
    })
    if (category === null) {
      const details: FieldError[] = [{ field: 'categoryCode', code: 'UNKNOWN' }]
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'unknown category', details)
    }

    // Геозабор — до единого байта в S3 и до единой строки в БД (SRS §5.3 п.3).
    const districtCode = await this.geo.findDistrictCode(input.latitude, input.longitude)
    if (districtCode === null) {
      throw new ApiException(
        'OUTSIDE_TASHKENT',
        HttpStatus.BAD_REQUEST,
        'point is outside all 12 Tashkent district polygons',
      )
    }

    const duplicateCandidateOfId = await this.duplicates.findCandidateRootId(input.latitude, input.longitude)

    const raw = await this.storeRawPhotos(photos, sniffed)

    const report = await this.prisma.$transaction(async (tx) => {
      return tx.report.create({
        data: {
          categoryId: category.id,
          districtCode,
          latitude: input.latitude,
          longitude: input.longitude,
          landmark: input.landmark,
          contactPhone: input.contactPhone,
          contactTelegram: input.contactTelegram,
          trackingToken: generateTrackingToken(),
          idempotencyKey: context.idempotencyKey,
          duplicateCandidateOfId,
          createdIp: context.clientIp,
          photos: {
            create: raw.map((photo, index) => ({
              kind: 'BEFORE' as const,
              sortOrder: index,
              rawKey: photo.key,
            })),
          },
          // Первая запись истории: создание, `from_status` пуст (SRS §2.7).
          history: { create: [{ fromStatus: null, toStatus: 'NEW' as const, actorType: 'SYSTEM' as const }] },
        },
        select: { publicNumber: true, trackingToken: true, status: true, createdAt: true },
      })
    })

    return {
      number: report.publicNumber,
      displayNumber: displayNumber(report.publicNumber),
      trackingToken: report.trackingToken,
      trackingPath: `/${input.locale}/z/${report.trackingToken}`,
      districtCode,
      status: report.status,
      // Фотографии ещё в очереди. Заявка при этом принята целиком: она в БД, у неё есть
      // номер, токен и место на карте (SRS §4.2).
      photosPending: true,
      createdAt: report.createdAt.toISOString(),
    }
  }

  /** Сырые байты уходят в `incoming/` одним PUT на файл — ноль процессорного времени.
   *  Хранилище недоступно → `503`: заявка не создаётся, клиент сохраняет черновик
   *  и повторяет с тем же ключом (SRS §4.2). Принять заявку без фотографий нельзя —
   *  фото это и есть основание для решения модератора (PRD §10.6). */
  private async storeRawPhotos(
    photos: UploadedPhoto[],
    types: (string | null)[],
  ): Promise<{ key: string }[]> {
    try {
      return await Promise.all(
        photos.map(async (photo, index) => {
          const key = incomingKey()
          await this.s3.putRaw(key, photo.buffer, types[index] ?? 'application/octet-stream')
          return { key }
        }),
      )
    } catch {
      throw new ApiException(
        'STORAGE_UNAVAILABLE',
        HttpStatus.SERVICE_UNAVAILABLE,
        'photo storage is unavailable',
      )
    }
  }
}
