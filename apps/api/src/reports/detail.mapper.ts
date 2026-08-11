import type { ReportDetail, ReportHistoryEntry, ReportPhotoView, ReportStatus } from '@ravonroad/shared-types'
import { displayNumber } from './reports.service'

/** Одна выборка карточки на два маршрута: публичный `/reports/:number` и личный
 *  `/track/:token`. Разница между ними — три поля, которые видит только владелец ссылки
 *  (SRS §4.5), а всё остальное обязано совпадать до буквы, иначе житель на своей странице
 *  увидит не то, что показано всем. */
export const DETAIL_SELECT = {
  publicNumber: true,
  status: true,
  districtCode: true,
  category: { select: { code: true } },
  landmark: true,
  latitude: true,
  longitude: true,
  publicationUrl: true,
  createdAt: true,
  doneAt: true,
  photos: { select: { kind: true, state: true, objectKey: true, previewKey: true, sortOrder: true } },
  history: { select: { toStatus: true, createdAt: true, undoneAt: true } },
}

interface PhotoRow {
  kind: string
  state: string
  objectKey: string | null
  previewKey: string | null
  sortOrder: number
}

interface HistoryRow {
  toStatus: string
  createdAt: Date
  undoneAt: Date | null
}

interface Decimalish {
  toNumber: () => number
}

export interface DetailRow {
  publicNumber: number
  status: string
  districtCode: string
  category: { code: string }
  landmark: string | null
  latitude: Decimalish
  longitude: Decimalish
  publicationUrl: string | null
  createdAt: Date
  doneAt: Date | null
  photos: PhotoRow[]
  history: HistoryRow[]
}

/** `nearby` приходит снаружи, а не считается здесь: список соседей берётся из снимка
 *  точек, которого у страницы отслеживания нет и не должно быть — там показывается одна
 *  заявка по ссылке, а не окрестности (SRS §4.5). */
export function mapDetail(
  report: DetailRow,
  publicUrl: (key: string) => string,
  nearby: ReportDetail['nearby'] = [],
): ReportDetail {
  // Фото не в `READY` в ответе отсутствуют: ключа у них ещё нет, и ссылка вела бы
  // в пустоту. Что они появятся, сообщает `photosPending` (SRS §4.4).
  // Порядок задаётся здесь, а не в запросе: строк на заявку не больше шести,
  // и сортировать их в БД значит держать `orderBy` в двух местах.
  const photos: ReportPhotoView[] = [...report.photos]
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.sortOrder - right.sortOrder)
    .filter((photo) => photo.state === 'READY' && photo.objectKey !== null && photo.previewKey !== null)
    .map((photo) => ({
      kind: photo.kind === 'AFTER' ? 'AFTER' : 'BEFORE',
      url: publicUrl(photo.objectKey as string),
      previewUrl: publicUrl(photo.previewKey as string),
    }))

  // Публичная история — только статус, дата и признак отмены. `actor_*` и `moderator_id`
  // не покидают сервер: личность модератора публично не раскрывается (PRD §6.2).
  const history: ReportHistoryEntry[] = [...report.history]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .map((entry) => ({
    status: entry.toStatus as ReportStatus,
    at: entry.createdAt.toISOString(),
    undone: entry.undoneAt !== null,
  }))

  return {
    number: report.publicNumber,
    displayNumber: displayNumber(report.publicNumber),
    status: report.status as ReportStatus,
    districtCode: report.districtCode,
    categoryCode: report.category.code,
    landmark: report.landmark,
    latitude: report.latitude.toNumber(),
    longitude: report.longitude.toNumber(),
    photos,
    photosPending: report.photos.some((photo) => photo.state !== 'READY'),
    history,
    publicationUrl: report.publicationUrl,
    createdAt: report.createdAt.toISOString(),
    doneAt: report.doneAt === null ? null : report.doneAt.toISOString(),
    nearby,
  }
}
