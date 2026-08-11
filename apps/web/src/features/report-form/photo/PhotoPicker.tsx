import { MAX_PHOTOS_PER_REPORT } from '@ravonroad/shared-types'
import { useEffect, useId, useMemo, useState } from 'react'
import { useI18n } from '../../../shared/i18n/useI18n'
import type { UiKey } from '../../../shared/i18n/messages'
import { randomUuid } from '../../../shared/lib/uuid'
import { StepHeader } from '../../../shared/ui/control/StepHeader'
import { Glyph } from '../../../shared/ui/icon/Glyph'
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

/** Плитка-приглашение: пустая форма показывает одну большую, заполненная — маленькую
 *  в конце ряда. Обе — `<label>` над одним и тем же `<input type="file">`, поэтому
 *  системный выбор открывается и по касанию, и с клавиатуры. */
const TILE = 'grid cursor-pointer place-items-center border-2 border-dashed border-[var(--border-2)] bg-[var(--surface-sunken)] text-[var(--text-2)] hover:bg-[var(--surface-control-hover)] aria-disabled:opacity-50'

/** Выбор и предпросмотр фотографий (US-008).
 *
 *  Уменьшение и перекодирование идут здесь же, до отправки: житель платит за мобильный
 *  трафик, и 3–6 МБ против 300 КБ — это его деньги (SRS §5.2). Предпросмотр показывает
 *  уже сжатый кадр, поэтому он и есть то, что уйдёт на сервер.
 *
 *  Отказ по одному файлу не отменяет остальные и не блокирует отправку: снимок остаётся
 *  ненабранным, заявка уходит с тем, что набралось. Кнопки «повторить» рядом с отказом
 *  нет намеренно — файл забракован при разборе, а не при передаче, и повторять нечего:
 *  тот же файл разберётся так же. */
export function PhotoPicker({ photos, onChange, error }: PhotoPickerProps) {
  const { t } = useI18n()
  const fieldId = useId()
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
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
  const inputId = `${fieldId}-input`
  const full = photos.length >= MAX_PHOTOS_PER_REPORT

  return (
    <fieldset className="flex flex-col gap-[var(--s-3)] border-0 p-0">
      <legend className="mb-[var(--s-2)] w-full">
        <StepHeader
          step="01"
          label={t('form.step.photos')}
          aside={<span className="tabular-nums">{`${photos.length} / ${MAX_PHOTOS_PER_REPORT}`}</span>}
        />
      </legend>

      {/* Перетаскивание — путь ноутбука: снимок уже лежит в папке, и открывать ради него
          системный выбор незачем. Он не заменяет кнопку, а стоит рядом с ней: на телефоне
          перетаскивать нечем, и «выберите файл» обязано остаться (Desktop C › «Surat»). */}
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void accept(event.dataTransfer.files)
        }}
        className={dragging ? 'rounded-[var(--r-4)] outline-2 outline-dashed outline-[var(--accent)]' : ''}
      >
      {photos.length === 0 ? (
        <label htmlFor={inputId} className={`${TILE} min-h-[128px] gap-[var(--s-3)] rounded-[var(--r-4)] p-[var(--s-4)]`}>
          <span className="grid h-[48px] w-[48px] place-items-center rounded-[var(--r-4)] bg-[var(--accent)] text-[var(--text-on-accent)]">
            <Glyph name="plus" size={20} />
          </span>
          <span className="t-step text-[var(--text-1)]">{busy ? t('form.photos.working') : t('form.photos.capture')}</span>
          <span className="t-caption text-center text-[var(--text-2)]">{t('form.photos.formats')}</span>
        </label>
      ) : (
        <ul className="grid grid-cols-3 gap-[var(--s-2)]">
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative aspect-[3/4] overflow-hidden rounded-[var(--r-4)]">
              <img src={previews[index]} alt="" className="h-full w-full object-cover" />
              {/* Зона нажатия 44 px при кружке 26: попасть по крестику на снимке 3/4
                  пальцем иначе нельзя, а увеличивать сам кружок значит закрыть им яму. */}
              <button
                type="button"
                onClick={() => onChange(photos.filter((candidate) => candidate.id !== photo.id))}
                aria-label={`${t('form.photos.remove')} ${index + 1}`}
                className="absolute top-0 right-0 grid h-[var(--touch-min)] w-[var(--touch-min)] place-items-center"
              >
                <span className="grid h-[26px] w-[26px] place-items-center rounded-[var(--r-pill)] bg-[rgba(18,22,28,.8)] text-[#FFFFFF]">
                  <Glyph name="close" size={10} />
                </span>
              </button>
              <span className="t-label absolute bottom-[var(--s-1)] left-[var(--s-1)] rounded-[var(--r-1)] bg-[var(--accent)] px-[var(--s-1)] py-[2px] text-[var(--text-on-accent)] tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
            </li>
          ))}
          {/* Снимок в обработке занимает своё место в ряду, а не прячется до готовности:
              иначе плитки прыгают, а житель не знает, взяли его файл или нет. Доли
              процента здесь нет и не будет — сжатие идёт одним проходом, и рисовать
              шкалу было бы враньём. */}
          {busy && (
            <li className="grid aspect-[3/4] place-items-center rounded-[var(--r-4)] bg-[var(--surface-sunken)]">
              <span
                aria-hidden="true"
                className="h-[24px] w-[24px] animate-[rr-spin_.8s_linear_infinite] rounded-[var(--r-pill)] border-[3px] border-[var(--border-2)] border-t-[var(--accent)]"
              />
            </li>
          )}
          {!full && !busy && (
            <li className="contents">
              <label
                htmlFor={inputId}
                aria-disabled={busy}
                className={`${TILE} aspect-[3/4] rounded-[var(--r-4)]`}
              >
                <Glyph name="plus" size={18} label={t('form.photos.add')} />
              </label>
            </li>
          )}
        </ul>
      )}

      {/* Подсказка стоит под сеткой всегда, а не только на пустой форме: ограничение
          по размеру и формату нужно знать перед вторым снимком так же, как перед первым. */}
      <p className="t-caption text-[var(--text-2)]">
        {t('form.photos.drop')} · {t('form.photos.formats')}
      </p>
      </div>

      <input
        id={inputId}
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
          заметив, что фотографий стало меньше, чем он выбрал. Красный здесь допустим —
          статусов в форме нет, и с REJECTED его не спутать. */}
      <div role="status" aria-live="polite" className="flex flex-col gap-[var(--s-2)] empty:hidden">
        {messages.map((message) => (
          <p
            key={message}
            className="t-caption rounded-[var(--r-4)] border border-[var(--status-rejected-line)] bg-[var(--status-rejected-tint)] px-[var(--s-3)] py-[var(--s-3)] text-[var(--status-rejected-ink)]"
          >
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
