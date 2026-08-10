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
