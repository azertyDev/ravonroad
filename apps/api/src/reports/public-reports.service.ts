import { HttpStatus, Injectable } from '@nestjs/common'
import {
  PUBLIC_STATUSES,
  type ReportDetail,
  type ReportListItem,
  type ReportListResponse,
  type ReportStatus,
} from '@ravonroad/shared-types'
import { ApiException } from '../common/api-error'
import { S3Service } from '../media/s3.service'
import { PrismaService } from '../prisma/prisma.service'
import { decodeCursor, encodeCursor } from './cursor'
import { DETAIL_SELECT, mapDetail } from './detail.mapper'
import { displayNumber } from './reports.service'
import type { ReportFilters } from './filters'

/** Потолок страницы (SRS §4.3). */
export const MAX_PAGE_SIZE = 50
const DEFAULT_PAGE_SIZE = 20

/** Чтение отделено от приёма заявок намеренно: писать в `reports.service.ts` будет
 *  смена статусов из Telegram, и два потока в одном файле разъехались бы на первом же
 *  параллельном изменении. */
@Injectable()
export class PublicReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async list(filters: ReportFilters, rawCursor: string | null, rawLimit: number | null): Promise<ReportListResponse> {
    const limit = Math.min(Math.max(rawLimit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const cursor = rawCursor === null ? null : decodeCursor(rawCursor)
    const dateColumn = filters.dateField === 'done' ? 'doneAt' : 'createdAt'

    const rows = await this.prisma.report.findMany({
      where: {
        status: { in: filters.statuses.length > 0 ? filters.statuses : [...PUBLIC_STATUSES] },
        ...(filters.category === null ? {} : { category: { code: filters.category } }),
        ...(filters.district === null ? {} : { districtCode: filters.district }),
        ...(filters.dateField === 'done' ? { doneAt: { not: null } } : {}),
        ...(filters.from === null && filters.to === null
          ? {}
          : {
              [dateColumn]: {
                ...(filters.from === null ? {} : { gte: filters.from }),
                ...(filters.to === null ? {} : { lte: filters.to }),
              },
            }),
        ...(filters.bbox === null
          ? {}
          : {
              latitude: { gte: filters.bbox.minLat, lte: filters.bbox.maxLat },
              longitude: { gte: filters.bbox.minLon, lte: filters.bbox.maxLon },
            }),
        // Keyset: строго «раньше» по паре (created_at, public_number). Вставка новых
        // заявок между страницами не сдвигает окно, поэтому нет ни дублей, ни пропусков.
        ...(cursor === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, publicNumber: { lt: cursor.number } },
              ],
            }),
      },
      select: {
        publicNumber: true,
        status: true,
        districtCode: true,
        category: { select: { code: true } },
        landmark: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        doneAt: true,
        photos: {
          where: { kind: 'BEFORE' },
          select: { state: true, previewKey: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { publicNumber: 'desc' }],
      // На одну больше запрошенного: наличие лишней строки и есть ответ на вопрос,
      // существует ли следующая страница. Отдельный COUNT для этого не нужен.
      take: limit + 1,
    })

    const page = rows.slice(0, limit)
    const last = page.at(-1)
    const items: ReportListItem[] = page.map((row) => {
      const ready = row.photos.find((photo) => photo.state === 'READY' && photo.previewKey !== null)
      return {
        number: row.publicNumber,
        displayNumber: displayNumber(row.publicNumber),
        status: row.status as ReportStatus,
        districtCode: row.districtCode,
        categoryCode: row.category.code,
        landmark: row.landmark,
        latitude: row.latitude.toNumber(),
        longitude: row.longitude.toNumber(),
        previewUrl: ready === undefined ? null : this.s3.publicUrl(ready.previewKey as string),
        photosPending: row.photos.some((photo) => photo.state !== 'READY'),
        photoCount: row.photos.length,
        createdAt: row.createdAt.toISOString(),
        doneAt: row.doneAt === null ? null : row.doneAt.toISOString(),
      }
    })

    return {
      items,
      nextCursor:
        rows.length > limit && last !== undefined
          ? encodeCursor({ createdAt: last.createdAt, number: last.publicNumber })
          : null,
      // Всегда `null`: COUNT(*) по фильтру стоит полного скана, а показывать его негде
      // (SRS §4.3).
      total: null,
    }
  }

  /** `REJECTED` и `DUPLICATE` отвечают тем же `404`, что и несуществующий номер:
   *  скрывается не только содержимое, но и сам факт существования заявки (SRS §9.2). */
  async detail(number: number): Promise<ReportDetail> {
    const report = await this.prisma.report.findFirst({
      where: { publicNumber: number, status: { in: [...PUBLIC_STATUSES] } },
      select: DETAIL_SELECT,
    })
    if (report === null) {
      throw new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND, 'report is not published')
    }
    return mapDetail(report, (key) => this.s3.publicUrl(key))
  }
}
