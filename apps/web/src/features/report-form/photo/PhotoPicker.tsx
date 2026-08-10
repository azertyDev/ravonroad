import { MAX_PHOTOS_PER_REPORT } from '@ravonroad/shared-types'
import { useEffect, useId, useMemo, useState } from 'react'
import { useI18n } from '../../../shared/i18n/useI18n'
import type { UiKey } from '../../../shared/i18n/messages'
import { randomUuid } from '../../../shared/lib/uuid'
import { compressPhoto, type CompressedPhoto, type PhotoRejection } from './compress'

export interface SelectedPhoto extends CompressedPhoto {
  /** Ключ списка React. Имя файла не годится: два снимка подряд с телефона
   *  называются одинаково. */
  id: string
}

const REJECTION_KEY: Record<PhotoRejection, UiKey> = {
  TOO_LARGE: 'form.photos.tooLarge',
  STILL_TOO_LARGE: 'form.photos.stillTooLarge',
  DECODE_FAILED: 'form.photos.decodeFailed',
}

interface PhotoPickerProps {
  photos: SelectedPhoto[]
  onChange: (photos: SelectedPhoto[]) => void
  error?: string | undefined
}

/** Выбор и предпросмотр фотографий (US-008).
 *
 *  Уменьшение и перекодирование идут здесь же, до отправки: житель платит за мобильный
 *  трафик, и 3–6 МБ против 300 КБ — это его деньги (SRS §5.2). Предпросмотр показывает
 *  уже сжатый кадр, поэтому он и есть то, что уйдёт на сервер. */
export function PhotoPicker({ photos, onChange, error }: PhotoPickerProps) {
  const { t } = useI18n()
  const fieldId = useId()
  const [busy, setBusy] = useState(false)
  const [messages, setMessages] = useState<string[]>([])

  // Ссылки на превью держатся ровно столько, сколько живут сами фотографии:
  // забытый object URL — это удержанный в памяти кадр, а их здесь три по 7 МБ.
  const previews = useMemo(() => photos.map((photo) => URL.createObjectURL(photo.blob)), [photos])
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews])

  const accept = async (files: FileList | null): Promise<void> => {
    if (files === null || files.length === 0) return

    const free = MAX_PHOTOS_PER_REPORT - photos.length
    const chosen = [...files]
    const notices: string[] = []
    // Четвёртый файл не отменяет первые три: житель узнаёт, что взяли, а что нет.
    if (chosen.length > free) notices.push(t('form.photos.tooMany'))

    setBusy(true)
    const added: SelectedPhoto[] = []
    for (const file of chosen.slice(0, free)) {
      const result = await compressPhoto(file)
      // Один нечитаемый файл не отменяет остальные (SRS §5.2).
      if (result.ok) added.push({ ...result.photo, id: randomUuid() })
      else notices.push(`${file.name}: ${t(REJECTION_KEY[result.reason])}`)
    }
    setBusy(false)

    setMessages(notices)
    if (added.length > 0) onChange([...photos, ...added])
  }

  const errorId = `${fieldId}-error`
  const full = photos.length >= MAX_PHOTOS_PER_REPORT

  return (
    <fieldset className="flex flex-col gap-[var(--s-3)] border-0 p-0">
      <legend className="t-h3 mb-[var(--s-2)]">{t('form.photos.legend')}</legend>
      <p className="t-caption text-[var(--text-2)]">{t('form.photos.hint')}</p>

      {photos.length > 0 && (
        <ul className="flex flex-wrap gap-[var(--s-3)]">
          {photos.map((photo, index) => (
            <li key={photo.id} className="flex flex-col gap-[var(--s-1)]">
              <img
                src={previews[index]}
                alt=""
                width={96}
                height={96}
                className="h-[96px] w-[96px] rounded-[var(--r-2)] border border-[var(--border-1)] object-cover"
              />
              <button
                type="button"
                onClick={() => onChange(photos.filter((candidate) => candidate.id !== photo.id))}
                className="t-caption min-h-[var(--touch-min)] rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-2)]"
              >
                {t('form.photos.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <label
        className="t-label inline-flex min-h-[var(--touch-base)] w-fit cursor-pointer items-center rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)] aria-disabled:opacity-50"
        aria-disabled={full}
        htmlFor={`${fieldId}-input`}
      >
        {busy ? t('form.photos.working') : t('form.photos.add')}
      </label>
      <input
        id={`${fieldId}-input`}
        type="file"
        // HEIC в списке есть: на iOS его декодирует системный кодек, и конвертация
        // в JPEG происходит здесь же, до отправки (SRS §5.2).
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple
        disabled={full || busy}
        className="sr-only absolute h-px w-px overflow-hidden opacity-0"
        aria-describedby={error === undefined ? undefined : errorId}
        onChange={(event) => {
          void accept(event.target.files)
          // Сброс значения: выбрать тот же файл ещё раз иначе не получится —
          // change не срабатывает на неизменившемся value.
          event.target.value = ''
        }}
      />

      {/* Отказы объявляются вслух: без live-региона житель узнал бы о них, только
          заметив, что фотографий стало меньше, чем он выбрал. */}
      <div role="status" aria-live="polite" className="flex flex-col gap-[var(--s-1)]">
        {messages.map((message) => (
          <p key={message} className="t-caption text-[var(--text-2)]">
            {message}
          </p>
        ))}
      </div>

      {error !== undefined && (
        <p id={errorId} className="t-caption text-[var(--status-rejected-ink)]">
          {error}
        </p>
      )}
    </fieldset>
  )
}
