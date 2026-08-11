import { useMutation, useQuery } from '@tanstack/react-query'
import { LANDMARK_MAX_LENGTH, type CreateReportResponse } from '@ravonroad/shared-types'
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { catalogKeys, fetchCategories } from '../../entities/catalog/api'
import { createReport, recordFormOpen } from '../../entities/report/api'
import { ApiRequestError } from '../../shared/api/client'
import { useI18n } from '../../shared/i18n/useI18n'
import type { UiKey } from '../../shared/i18n/messages'
import { randomUuid } from '../../shared/lib/uuid'
import { clearDraft, loadDraft, saveDraft } from './draft'
import { PointPicker } from './map-pin/PointPicker'
import type { Point } from './map-pin/coordinates'
import { PhotoPicker, type SelectedPhoto } from './photo/PhotoPicker'

type FieldName = 'photos' | 'point' | 'category'

const FIELD_ERROR: Record<FieldName, UiKey> = {
  photos: 'form.photos.required',
  point: 'form.point.required',
  category: 'form.category.required',
}

const FIELD_CLASS =
  'min-h-[var(--touch-base)] w-full rounded-[var(--r-2)] border border-[var(--border-2)] bg-[var(--surface-card)] px-[var(--s-3)] text-[length:var(--t-min-input)]'

/** Черновик пишется не на каждую букву: сохранение тащит за собой три сжатых кадра,
 *  и делать это на каждом нажатии значило бы греть телефон впустую. */
const SAVE_DEBOUNCE_MS = 500

export function ReportForm({ onCreated }: { onCreated: (report: CreateReportResponse) => void }) {
  const { locale, t, errorText } = useI18n()

  const [photos, setPhotos] = useState<SelectedPhoto[]>([])
  const [point, setPoint] = useState<Point | null>(null)
  const [categoryCode, setCategoryCode] = useState('')
  const [landmark, setLandmark] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactTelegram, setContactTelegram] = useState('')
  const [website, setWebsite] = useState('')
  const [invalid, setInvalid] = useState<FieldName | null>(null)
  const [restored, setRestored] = useState(false)

  /** Момент открытия формы и ключ идемпотентности заводятся один раз на заполнение:
   *  ключ обязан пережить и неудачную отправку, и нажатие «повторить» (US-016). */
  const openedAt = useRef<string>(new Date().toISOString())
  const idempotencyKey = useRef<string>(randomUuid())

  const anchors = useRef<Partial<Record<FieldName, HTMLElement | null>>>({})
  /** Пока черновик не прочитан, писать нечего: иначе пустая форма затрёт сохранённую. */
  const loaded = useRef(false)

  useEffect(recordFormOpen, [])

  useEffect(() => {
    void loadDraft().then((draft) => {
      loaded.current = true
      if (draft === null) return
      idempotencyKey.current = draft.idempotencyKey
      openedAt.current = draft.formOpenedAt
      setPhotos(draft.photos)
      setPoint(draft.point)
      setCategoryCode(draft.categoryCode)
      setLandmark(draft.landmark)
      setContactPhone(draft.contactPhone)
      setContactTelegram(draft.contactTelegram)
      setRestored(true)
    })
  }, [])

  // Обрыв сети на отправке сохраняет всё, что житель уже сделал, включая обработку
  // фотографий: у бордюра ждать её второй раз — худшее, что можно предложить.
  useEffect(() => {
    if (!loaded.current) return
    const timer = setTimeout(() => {
      void saveDraft({
        savedAt: Date.now(),
        idempotencyKey: idempotencyKey.current,
        formOpenedAt: openedAt.current,
        point,
        categoryCode,
        landmark,
        contactPhone,
        contactTelegram,
        photos,
      })
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [photos, point, categoryCode, landmark, contactPhone, contactTelegram])

  const categories = useQuery({
    queryKey: catalogKeys.categories,
    queryFn: fetchCategories,
    staleTime: Number.POSITIVE_INFINITY,
  })

  const submission = useMutation({
    mutationFn: () => {
      if (point === null) throw new Error('point is required')
      return createReport(
        {
          latitude: point.latitude,
          longitude: point.longitude,
          categoryCode,
          landmark,
          contactPhone,
          contactTelegram,
          website,
          formOpenedAt: openedAt.current,
          locale,
          photos: photos.map((photo) => ({ blob: photo.blob, name: photo.name })),
        },
        idempotencyKey.current,
      )
    },
    onSuccess: (report) => {
      // Черновик и ключ живут ровно до успеха: следующая заявка — это новая заявка,
      // и переиспользованный ключ вернул бы жителю чужой номер.
      void clearDraft()
      onCreated(report)
    },
  })

  /** Первое незаполненное поле, в порядке следования на экране: туда переходит фокус,
   *  и там же стоит текст ошибки (AC-1). */
  const firstInvalid = (): FieldName | null => {
    if (photos.length === 0) return 'photos'
    if (point === null) return 'point'
    if (categoryCode === '') return 'category'
    return null
  }

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const problem = firstInvalid()
    // flushSync, а не обычный setState: фокус переносится строкой ниже, а текст ошибки
    // и aria-describedby появляются только следующим рендером. Без принудительной
    // отрисовки скринридер получил бы поле, у которого описания ещё нет, и промолчал
    // бы о причине (PRD §8.2).
    flushSync(() => setInvalid(problem))
    if (problem !== null) {
      const anchor = anchors.current[problem]
      // Фокус — на само поле, а не на обёртку: у обёртки нет ни имени, ни описания,
      // и попавший на неё пользователь скринридера слышит тишину.
      const field = anchor?.querySelector<HTMLElement>('input, select, textarea')
      ;(field ?? anchor)?.focus()
      return
    }
    submission.mutate()
  }

  /** Ошибка держится ровно до тех пор, пока поле пустое. Без второй проверки она
   *  оставалась бы на экране вместе с уже выбранной фотографией — и вместе
   *  с `aria-invalid`, то есть скринридер сообщал бы об ошибке, которой больше нет. */
  const errorFor = (field: FieldName): string | undefined =>
    invalid === field && firstInvalid() === field ? t(FIELD_ERROR[field]) : undefined

  const failure = submission.error
  const failureText =
    failure instanceof ApiRequestError ? errorText(failure.code) : failure === null ? null : t('form.error.network')

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[var(--block-gap)]">
      <div className="flex flex-col gap-[var(--s-3)]">
        <h1 className="t-h1">{t('form.title')}</h1>
        <p className="t-body text-[var(--text-2)]">{t('form.lead')}</p>
      </div>

      {restored && (
        <div className="flex flex-wrap items-center gap-[var(--s-3)] rounded-[var(--r-3)] bg-[var(--surface-sunken)] p-[var(--s-4)]">
          <p className="t-caption flex-1 text-[var(--text-2)]">{t('form.draft.restored')}</p>
          <button
            type="button"
            onClick={() => {
              void clearDraft()
              setPhotos([])
              setPoint(null)
              setCategoryCode('')
              setLandmark('')
              setContactPhone('')
              setContactTelegram('')
              // Новый ключ: очищенная форма — это другая заявка, а не та же самая.
              idempotencyKey.current = randomUuid()
              setRestored(false)
            }}
            className="t-label min-h-[var(--touch-base)] rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
          >
            {t('form.draft.clear')}
          </button>
        </div>
      )}

      <div ref={(element) => void (anchors.current.photos = element)} tabIndex={-1}>
        <PhotoPicker photos={photos} onChange={setPhotos} error={errorFor('photos')} />
      </div>

      <div ref={(element) => void (anchors.current.point = element)} tabIndex={-1}>
        <PointPicker value={point} onChange={setPoint} error={errorFor('point')} />
      </div>

      <div className="flex flex-col gap-[var(--s-1)]">
        <label className="t-h3" htmlFor="category">
          {t('form.category.label')}
        </label>
        <select
          id="category"
          className={FIELD_CLASS}
          ref={(element) => void (anchors.current.category = element)}
          value={categoryCode}
          aria-invalid={invalid === 'category' || undefined}
          aria-describedby={invalid === 'category' ? 'category-error' : undefined}
          onChange={(event) => setCategoryCode(event.target.value)}
        >
          <option value="">{t('form.category.placeholder')}</option>
          {(categories.data ?? []).map((category) => (
            <option key={category.code} value={category.code}>
              {locale === 'ru' ? category.nameRu : category.nameUz}
            </option>
          ))}
        </select>
        {invalid === 'category' && (
          <p id="category-error" className="t-caption text-[var(--status-rejected-ink)]">
            {t('form.category.required')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-[var(--s-1)]">
        <label className="t-h3" htmlFor="landmark">
          {t('form.landmark.label')}
        </label>
        {/* Предупреждение стоит до поля, а не после: прочитать его имеет смысл
            прежде, чем человек напишет номер своей квартиры (PRD §12.10). */}
        <p id="landmark-hint" className="t-caption text-[var(--text-2)]">
          {t('form.landmark.hint')}
        </p>
        <input
          id="landmark"
          className={FIELD_CLASS}
          value={landmark}
          maxLength={LANDMARK_MAX_LENGTH}
          aria-describedby="landmark-hint landmark-counter"
          onChange={(event) => setLandmark(event.target.value)}
        />
        <p id="landmark-counter" className="t-caption tabular-nums text-[var(--text-2)]">
          {landmark.length}/{LANDMARK_MAX_LENGTH}
        </p>
      </div>

      <fieldset className="flex flex-col gap-[var(--s-3)] border-0 p-0">
        <legend className="t-h3 mb-[var(--s-2)]">{t('form.contacts.legend')}</legend>
        {/* Пояснение рядом с полями, а не в подвале: решение «оставлять ли телефон»
            принимается в момент заполнения (PRD §9.2.1). */}
        <p className="t-caption text-[var(--text-2)]">{t('form.contacts.notice')}</p>

        <label className="t-caption" htmlFor="phone">
          {t('form.contacts.phone')}
        </label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          className={FIELD_CLASS}
          value={contactPhone}
          onChange={(event) => setContactPhone(event.target.value)}
        />

        <label className="t-caption" htmlFor="telegram">
          {t('form.contacts.telegram')}
        </label>
        <input
          id="telegram"
          autoComplete="off"
          className={FIELD_CLASS}
          value={contactTelegram}
          onChange={(event) => setContactTelegram(event.target.value)}
        />
      </fieldset>

      {/* Honeypot: не виден человеку и не объявлен скринридеру (PRD §10.2). Заполнен —
          заявка всё равно создаётся, но получает флаг: автозаполнение браузера даёт
          ложные срабатывания, а цена ложного отказа — потерянная настоящая яма. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <input
          tabIndex={-1}
          autoComplete="off"
          name="website"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      {failureText !== null && (
        <p role="alert" className="t-body text-[var(--status-rejected-ink)]">
          {failureText}
        </p>
      )}

      <button
        type="submit"
        disabled={submission.isPending}
        className="t-label inline-flex min-h-[var(--touch-cta)] items-center justify-center rounded-[var(--r-3)] bg-[var(--accent)] px-[var(--s-6)] text-[var(--text-on-accent)] disabled:opacity-60"
      >
        {submission.isPending
          ? t('form.submitting')
          : submission.isError
            ? t('form.retry')
            : t('form.submit')}
      </button>
    </form>
  )
}
