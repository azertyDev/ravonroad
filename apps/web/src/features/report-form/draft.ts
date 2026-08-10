import type { Point } from './map-pin/coordinates'
import type { SelectedPhoto } from './photo/PhotoPicker'

/** Черновик формы: поля, координаты, **уже сжатые** фотографии и ключ идемпотентности
 *  (US-016, SRS §7.6).
 *
 *  IndexedDB, а не `localStorage`: там только строки, а сжатые фотографии — это Blob,
 *  и перегонять их в base64 значило бы раздуть на треть и потратить память телефона
 *  ровно в тот момент, когда её и так мало.
 *
 *  Хранятся именно сжатые кадры: у бордюра сеть пропала после того, как житель уже
 *  дождался обработки трёх фотографий, и заставлять его ждать её снова — худшее,
 *  что можно сделать. */
export interface ReportDraft {
  savedAt: number
  /** Один ключ на всё заполнение: «повторить» после обрыва сети обязано дать
   *  ту же заявку, а не вторую (US-016). */
  idempotencyKey: string
  formOpenedAt: string
  point: Point | null
  categoryCode: string
  landmark: string
  contactPhone: string
  contactTelegram: string
  photos: SelectedPhoto[]
}

/** Сутки. Дольше держать бессмысленно: яма либо уже отправлена, либо житель к ней
 *  не вернётся, а фотографии занимают место на его телефоне. */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

const DATABASE = 'ravonroad'
const STORE = 'draft'
const KEY = 'report-form'

export function isExpired(savedAt: number, now: number = Date.now()): boolean {
  return now - savedAt >= DRAFT_TTL_MS
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.addEventListener('upgradeneeded', () => {
      request.result.createObjectStore(STORE)
    })
    request.addEventListener('success', () => resolve(request.result))
    request.addEventListener('error', () => reject(request.error))
  })
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode)
        const request = action(transaction.objectStore(STORE))
        request.addEventListener('success', () => resolve(request.result))
        request.addEventListener('error', () => reject(request.error))
        transaction.addEventListener('complete', () => database.close())
      }),
  )
}

export async function saveDraft(draft: ReportDraft): Promise<void> {
  // Черновик — удобство, а не обязательство. Приватный режим, переполненный диск
  // и запрет хранилища не должны мешать отправить заявку.
  try {
    await run('readwrite', (store) => store.put(draft, KEY))
  } catch {
    return
  }
}

export async function loadDraft(now: number = Date.now()): Promise<ReportDraft | null> {
  let draft: ReportDraft | undefined
  try {
    draft = await run<ReportDraft | undefined>('readonly', (store) => store.get(KEY))
  } catch {
    return null
  }
  if (draft === undefined) return null
  if (isExpired(draft.savedAt, now)) {
    await clearDraft()
    return null
  }
  return draft
}

export async function clearDraft(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(KEY))
  } catch {
    return
  }
}
