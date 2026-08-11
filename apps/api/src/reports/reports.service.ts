import { HttpStatus, Injectable } from '@nestjs/common'
import {
  MAX_PHOTOS_PER_REPORT,
  type CreateReportResponse,
  type FieldError,
  type ReportStatus,
} from '@ravonroad/shared-types'
import { ApiException } from '../common/api-error'
import { ipPrefix, logEvent } from '../common/logger'
import { Prisma } from '../generated/prisma/client'
import { AbuseService, type AbuseSignalDraft } from './abuse.service'
import { DuplicatesService } from '../geo/duplicates.service'
import { GeoService } from '../geo/geo.service'
import { incomingKey } from '../media/object-keys'
import { S3Service } from '../media/s3.service'
import { PrismaService } from '../prisma/prisma.service'
import type { CreateReportInput } from './create-report.input'
import { sniffImageType } from './sniffer'
import { generateTrackingToken } from './tracking-token'

/** Файл, как его отдаёт multer. Объявлен здесь, а не взят из `@types/multer`: нужны
 *  ровно байты, и ради одного поля ставить пакет типов незачем. */
export interface UploadedPhoto {
  buffer: Buffer
}

export interface CreateReportContext {
  idempotencyKey: string
  clientIp: string | null
}

export interface CreateReportOutcome {
  response: CreateReportResponse
  /** `true` — заявка уже существовала: это повтор по тому же ключу, и ответ `200`. */
  replayed: boolean
}

/** Уникальное ограничение нарушено. Prisma не даёт типа для кода ошибки драйвера,
 *  а нам нужен ровно один: повтор вставки по `idempotency_key`. */
const UNIQUE_VIOLATION = 'P2002'

/** Маршрут в лог пишется константой, а не из `request.url`: в адресах системы живёт
 *  `tracking_token`, и одна подстановка настоящего пути однажды положила бы его в лог. */
const ROUTE = 'POST /api/reports'

/** Номер показывается человеку только так: `RR-` — часть контракта, а не строка локали
 *  (SRS §4.2). Считает его сервер, иначе две локали фронта разъедутся между собой. */
export function displayNumber(publicNumber: number): string {
  return `RR-${publicNumber}`
}

interface InsertedReport {
  publicNumber: number
  trackingToken: string
  status: ReportStatus
  createdAt: Date
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geo: GeoService,
    private readonly duplicates: DuplicatesService,
    private readonly s3: S3Service,
    private readonly abuse: AbuseService,
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
  ): Promise<CreateReportOutcome> {
    // Повтор проверяется первым и стоит один индексный поиск: житель на плохой сети
    // жмёт «повторить», не зная, дошла ли отправка, и вторая загрузка тех же трёх
    // фотографий обошлась бы ему в трафик, а нам — в объекты в бакете (US-016).
    const replay = await this.findByIdempotencyKey(context.idempotencyKey, input)
    if (replay !== null) return { response: replay, replayed: true }

    // Считается после проверки повтора: три нажатия «повторить» — это одна заявка,
    // и тратить на них лимит адреса было бы наказанием за плохую сеть.
    const reportsThisHour = this.abuse.admit(context.clientIp)

    if (photos.length === 0) {
      throw new ApiException('PHOTOS_REQUIRED', HttpStatus.BAD_REQUEST, 'at least one photo is required')
    }
    if (photos.length > MAX_PHOTOS_PER_REPORT) {
      throw new ApiException(
        'VALIDATION_FAILED',
        HttpStatus.BAD_REQUEST,
        `at most ${MAX_PHOTOS_PER_REPORT} photos are accepted`,
        { details: [{ field: 'photos', code: 'TOO_MANY' }] },
      )
    }

    // Тип определяется по байтам, а не по заголовку от клиента (SRS §5.3 п.2).
    const types = photos.map((photo) => sniffImageType(photo.buffer))
    if (types.some((type) => type === null)) {
      logEvent('warn', 'photo_rejected', { route: ROUTE, status: 415, reason: 'unsupported_type' })
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
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'unknown category', { details })
    }

    // Геозабор — до единого байта в S3 и до единой строки в БД (SRS §5.3 п.3).
    const districtCode = await this.geo.findDistrictCode(input.latitude, input.longitude)
    if (districtCode === null) {
      // Доля этого события за период и есть метрика P-2 (SRS §10.3).
      const prefix = ipPrefix(context.clientIp)
      logEvent('warn', 'report_rejected_geofence', { route: ROUTE, status: 400, district: null, ipPrefix: prefix })
      throw new ApiException(
        'OUTSIDE_TASHKENT',
        HttpStatus.BAD_REQUEST,
        'point is outside all 12 Tashkent district polygons',
      )
    }

    const duplicateCandidateOfId = await this.duplicates.findCandidateRootId(input.latitude, input.longitude)
    const signals = this.abuse.signalsFor({
      honeypotFilled: input.honeypotFilled,
      formOpenedAt: input.formOpenedAt,
      photoCount: photos.length,
      reportsThisHour,
    })
    const rawKeys = await this.storeRawPhotos(photos, types)

    const report = await this.insertReport({
      input,
      context,
      categoryId: category.id,
      districtCode,
      duplicateCandidateOfId,
      rawKeys,
      signals,
    })

    if (report === null) {
      // Гонка двух «повторить» с одним ключом: уникальный индекс отдал вторую вставку
      // назад, и заявка уже есть. Тот же повтор, только выясненный вставкой, а не чтением.
      const replayed = await this.findByIdempotencyKey(context.idempotencyKey, input)
      if (replayed === null) throw new Error('report vanished between insert conflict and re-read')
      return { response: replayed, replayed: true }
    }

    logEvent('info', 'report_created', { route: ROUTE, status: 201, reportId: report.publicNumber, district: districtCode })

    return {
      response: {
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
      },
      replayed: false,
    }
  }

  /** Заявка, фотографии в `PENDING`, первая запись истории — одной транзакцией.
   *  Состояние «заявка есть, а задачи на обработку нет» невозможно by construction:
   *  очередь это те же строки, и создаются они здесь же (ADR-0007).
   *
   *  `null` означает, что ключ идемпотентности уже занят. */
  private async insertReport(args: {
    input: CreateReportInput
    context: CreateReportContext
    categoryId: number
    districtCode: string
    duplicateCandidateOfId: number | null
    rawKeys: string[]
    signals: AbuseSignalDraft[]
  }): Promise<InsertedReport | null> {
    const { input, context, categoryId, districtCode, duplicateCandidateOfId, rawKeys, signals } = args
    try {
      return await this.prisma.$transaction(async (tx) =>
        tx.report.create({
          data: {
            categoryId,
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
              create: rawKeys.map((rawKey, index) => ({
                kind: 'BEFORE' as const,
                sortOrder: index,
                rawKey,
              })),
            },
            // Первая запись истории: создание, `from_status` пуст (SRS §2.7).
            history: {
              create: [{ fromStatus: null, toStatus: 'NEW' as const, actorType: 'SYSTEM' as const }],
            },
            // Сигналы пишутся той же транзакцией: заявка с флагом и заявка без него
            // не должны существовать как два разных исхода одной отправки.
            abuseSignals: {
              // Prisma отличает JSON-значение null от отсутствия значения; в колонке
              // нужен именно SQL NULL, поэтому DbNull, а не литерал.
              create: signals.map((signal) => ({ rule: signal.rule, detail: signal.detail ?? Prisma.DbNull })),
            },
          },
          select: { publicNumber: true, trackingToken: true, status: true, createdAt: true },
        }),
      )
    } catch (error) {
      if (isUniqueViolation(error)) return null
      throw error
    }
  }

  /** Ответ на повтор с тем же `Idempotency-Key` (SRS §4.2).
   *
   *  Тот же ключ с **другим** содержимым — это ошибка клиента, а не повтор, и она
   *  отвечает `409`: молча вернуть чужую заявку значило бы показать жителю номер,
   *  к которому его фотографии не имеют отношения.
   *
   *  Сравниваются поля, которые мы храним. Фотографии в сравнение не входят: их
   *  `sha256` появляется только после перекодирования в воркере, а форма держит ключ
   *  вместе с уже сжатыми фотографиями и повторяет отправку тем же набором. */
  private async findByIdempotencyKey(
    idempotencyKey: string,
    input: CreateReportInput,
  ): Promise<CreateReportResponse | null> {
    const existing = await this.prisma.report.findUnique({
      where: { idempotencyKey },
      select: {
        publicNumber: true,
        trackingToken: true,
        districtCode: true,
        status: true,
        createdAt: true,
        latitude: true,
        longitude: true,
        landmark: true,
        contactPhone: true,
        contactTelegram: true,
        category: { select: { code: true } },
        photos: { select: { state: true } },
      },
    })
    if (existing === null) return null

    const sameRequest =
      existing.latitude.toNumber() === input.latitude &&
      existing.longitude.toNumber() === input.longitude &&
      existing.category.code === input.categoryCode &&
      existing.landmark === input.landmark &&
      existing.contactPhone === input.contactPhone &&
      existing.contactTelegram === input.contactTelegram
    if (!sameRequest) {
      throw new ApiException(
        'IDEMPOTENCY_CONFLICT',
        HttpStatus.CONFLICT,
        'this Idempotency-Key was used for a different report',
      )
    }

    return {
      number: existing.publicNumber,
      displayNumber: displayNumber(existing.publicNumber),
      trackingToken: existing.trackingToken,
      trackingPath: `/${input.locale}/z/${existing.trackingToken}`,
      districtCode: existing.districtCode,
      status: existing.status,
      // Состояние очереди читается заново: за время между попытками фотографии могли
      // дойти до READY, и врать об этом ответу незачем.
      photosPending: existing.photos.some((photo) => photo.state === 'PENDING'),
      createdAt: existing.createdAt.toISOString(),
    }
  }

  /** Сырые байты уходят в `incoming/` одним PUT на файл — ноль процессорного времени.
   *  Хранилище недоступно → `503`: заявка не создаётся, клиент сохраняет черновик
   *  и повторяет с тем же ключом (SRS §4.2). */
  private async storeRawPhotos(photos: UploadedPhoto[], types: (string | null)[]): Promise<string[]> {
    try {
      return await Promise.all(
        photos.map(async (photo, index) => {
          const key = incomingKey()
          await this.s3.putRaw(key, photo.buffer, types[index] ?? 'application/octet-stream')
          return key
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION
}
