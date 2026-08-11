import type { Locale } from './locale'

/** Жизненный цикл заявки на ремонт ямы. Сущность называется Report: Request в NestJS
    занят HTTP-запросом (преамбула docs/srs.md). */
export const REPORT_STATUSES = [
  'NEW',
  'ACCEPTED',
  'IN_PROGRESS',
  'DONE',
  'REJECTED',
  'DUPLICATE',
  'OUT_OF_SCOPE',
] as const

export type ReportStatus = (typeof REPORT_STATUSES)[number]

/** Что публично: карта, список, карточка (PRD §6.1). `REJECTED` и `DUPLICATE` скрыты —
 *  по прямой ссылке они отвечают `404`, неотличимо от несуществующей заявки (SRS §9.2).
 *  `OUT_OF_SCOPE` виден намеренно: реестр «не по силам» публикуется (BRD §7).
 *
 *  Список один на обе стороны: сервер по нему фильтрует, клиент по нему красит маркеры,
 *  и разъехавшись они показали бы разные наборы заявок. */
export const PUBLIC_STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'OUT_OF_SCOPE'] as const

export type PublicStatus = (typeof PUBLIC_STATUSES)[number]

export function isPublicStatus(value: string): value is PublicStatus {
  return (PUBLIC_STATUSES as readonly string[]).includes(value)
}

/** Лимиты приёма (SRS §4.2, §5.3). Объявлены один раз: форма отклоняет файл на устройстве,
 *  сервер — на потоке, и разъехавшиеся числа означали бы, что житель узнаёт об отказе
 *  только после того, как оплатил трафик. */
export const MAX_PHOTOS_PER_REPORT = 3
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
export const LANDMARK_MAX_LENGTH = 200

/** Форматы, которые сервер распознаёт по magic bytes (SRS §5.3 п.2). HEIC в списке нет:
 *  клиент конвертирует его в JPEG до отправки, а sharp без libheif его не декодирует. */
export const ACCEPTED_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export type AcceptedPhotoMimeType = (typeof ACCEPTED_PHOTO_MIME_TYPES)[number]

/** Нефайловые части `multipart/form-data` (SRS §4.2). Файлы идут отдельными частями
 *  `photos` и в контракт не попадают: у них нет представления в JSON. */
export interface CreateReportRequest {
  latitude: number
  longitude: number
  categoryCode: string
  landmark?: string
  contactPhone?: string
  contactTelegram?: string
  /** Локаль для `trackingPath`. Проверяется сервером, значение вне списка отклоняется. */
  locale?: Locale
  /** Honeypot: заполнено — заявка создаётся и получает сигнал, а не отказ (PRD §10.2). */
  website?: string
  /** Момент открытия формы, ISO. База для правила «скорость» (PRD §10.3). */
  formOpenedAt?: string
}

/** Ответ `201` (SRS §4.2). Приватных полей здесь нет и быть не может: ни `contact*`,
 *  ни `created_ip`, ни сигналов антиабуза (PRD §6.2) — это проверяется тестом. */
export interface CreateReportResponse {
  number: number
  /** Считает сервер: формат `RR-` — часть контракта, а не строка локали (SRS §4.2). */
  displayNumber: string
  trackingToken: string
  trackingPath: string
  districtCode: string
  status: ReportStatus
  /** `true` — фотографии ещё в очереди обработки; заявка при этом принята целиком. */
  photosPending: boolean
  createdAt: string
}

/** Коды причин, обязательных при переходах в `REJECTED` и `OUT_OF_SCOPE`
 *  (PRD §5.2, глоссарий). Житель читает их на `/z/<token>`, значит клиент обязан иметь
 *  строку на каждый код в обеих локалях — иначе `pnpm typecheck` красный (SRS §8.1).
 *
 *  Причины — код, а не данные, в отличие от категорий (SRS §2.5): их список меняется
 *  вместе с машиной состояний, а не по решению координатора, и каждая новая причина
 *  всё равно требует перевода. */
export const REJECT_REASON_CODES = ['not_road_defect', 'unreadable_photo', 'spam', 'other'] as const

export type RejectReasonCode = (typeof REJECT_REASON_CODES)[number]

export const OUT_OF_SCOPE_REASON_CODES = [
  'ground_sinkhole',
  'utilities',
  'highway',
  'too_large',
  'other',
] as const

export type OutOfScopeReasonCode = (typeof OUT_OF_SCOPE_REASON_CODES)[number]

/** Текст при `other` вводит модератор, и он **не переводится**: показывается жителю
 *  как введён, о чём написано рядом (PRD §5.2). */
export type StatusReasonCode = RejectReasonCode | OutOfScopeReasonCode
/** Фотография в публичном ответе (SRS §4.4). Фото со `state <> 'READY'` в ответ
 *  не попадают вовсе — вместо ссылки на несуществующий объект клиент получает
 *  `photosPending` и показывает плейсхолдер. */
export const PHOTO_KINDS = ['BEFORE', 'AFTER'] as const

export type PhotoKind = (typeof PHOTO_KINDS)[number]

export interface ReportPhotoView {
  kind: PhotoKind
  url: string
  previewUrl: string
}

/** Публичная история переходов (SRS §2.7, PRD §6.2). Здесь нет и не может быть
 *  `actor_type`, `actor_telegram_user_id` и `moderator_id`: даты и статусы публичны,
 *  личность модератора — нет. Отменённый переход остаётся в истории со своим признаком:
 *  история не переписывается задним числом (PRD 5.3.4). */
export interface ReportHistoryEntry {
  status: ReportStatus
  at: string
  undone: boolean
}

/** Точка карты (SRS §4.4): `[lon, lat, statusIndex, number]`. Кортеж, а не объект,
 *  и индекс, а не строка статуса: на 5000 точках это экономит ~60 КБ из бюджета в 700 КБ
 *  (PRD §8.1). Индекс указывает в `statuses` того же ответа. */
export type ReportMapPoint = [number, number, number, number]

export interface ReportMapResponse {
  points: ReportMapPoint[]
  /** Словарь индексов. Приходит вместе с точками, а не берётся из клиентской константы:
   *  разъехавшись, они покрасили бы заявки в чужие статусы. */
  statuses: ReportStatus[]
  /** Сервер отдал не всё: сработал жёсткий `LIMIT 5000`. UI просит приблизить карту. */
  truncated: boolean
}

/** Строка списка (SRS §4.3). `previewUrl` — `null`, пока фотографии в очереди. */
export interface ReportListItem {
  number: number
  displayNumber: string
  status: ReportStatus
  districtCode: string
  categoryCode: string
  landmark: string | null
  latitude: number
  longitude: number
  previewUrl: string | null
  photosPending: boolean
  photoCount: number
  createdAt: string
  doneAt: string | null
}

export interface ReportListResponse {
  items: ReportListItem[]
  /** `null` — страниц больше нет. Курсор keyset, непрозрачный: формат меняется вместе
   *  с сортировкой, и клиент на него не завязывается (SRS §4.3). */
  nextCursor: string | null
  /** Всегда `null` в MVP: `COUNT(*)` по фильтру стоит полного скана (SRS §4.3). */
  total: null
}

/** Публичная карточка (SRS §4.4). `REJECTED` и `DUPLICATE` сюда не доходят: по прямой
 *  ссылке они отвечают `404`, неотличимо от несуществующей заявки (SRS §9.2). */
export interface ReportDetail {
  number: number
  displayNumber: string
  status: ReportStatus
  districtCode: string
  categoryCode: string
  landmark: string | null
  latitude: number
  longitude: number
  photos: ReportPhotoView[]
  photosPending: boolean
  history: ReportHistoryEntry[]
  publicationUrl: string | null
  createdAt: string
  doneAt: string | null
}
