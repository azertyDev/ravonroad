import { useMutation, useQuery } from '@tanstack/react-query'
import { LANDMARK_MAX_LENGTH, type CreateReportResponse } from '@ravonroad/shared-types'
import { useEffect, useRef, useState } from 'react'
import { catalogKeys, fetchCategories, localizedName } from '../../entities/catalog/api'
import { createReport, recordFormOpen } from '../../entities/report/api'
import { ApiRequestError } from '../../shared/api/client'
import { useI18n } from '../../shared/i18n/useI18n'
import type { UiKey } from '../../shared/i18n/messages'
import { randomUuid } from '../../shared/lib/uuid'
import { ActionBar } from '../../shared/ui/control/ActionBar'
import { CatalogState } from '../../shared/ui/state/CatalogState'
import { StepHeader } from '../../shared/ui/control/StepHeader'
import { COMPACT, CTA, CTA_MUTED, FIELD, SECONDARY } from '../../shared/ui/control/styles'
import { ToggleChip } from '../../shared/ui/control/ToggleChip'
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

/** Черновик пишется не на каждую букву: сохранение тащит за собой три сжатых кадра,
 *  и делать это на каждом нажатии значило бы греть телефон впустую. */
const SAVE_DEBOUNCE_MS = 500

/** Форма заявки в плакатном ключе (Form C): нумерация шагов вместо подписей-инструкций,
 *  жёлтая цифра шага — единственное украшение. Порядок шагов идёт от того, что человек
 *  уже держит в руке (фото), к тому, что необязательно (контакт).
 *
 *  Обязательные шаги помечены жёлтым номером, необязательный — серым: жёлтый здесь
 *  обещает, что без этого шага заявку не отправить. */
interface ReportFormProps {
  onCreated: (report: CreateReportResponse) => void
  /** «Отмена»: форма живёт модальным окном поверх карты, и уйти из неё надо не только
   *  крестиком в углу, но и кнопкой рядом с отправкой (Desktop C › подвал модала). */
  onCancel: () => void
}

export function ReportForm({ onCreated, onCancel }: ReportFormProps) {
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
   *  и там же стоит текст ошибки (AC-1). Ориентир идёт между точкой и типом, но он
   *  необязателен, и на этот порядок не влияет. */
  const firstInvalid = (): FieldName | null => {
    if (photos.length === 0) return 'photos'
    if (point === null) return 'point'
    if (categoryCode === '') return 'category'
    return null
  }

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const problem = firstInvalid()
    setInvalid(problem)
    if (problem !== null) {
      anchors.current[problem]?.focus()
      return
    }
    submission.mutate()
  }

  const errorFor = (field: FieldName): string | undefined =>
    invalid === field ? t(FIELD_ERROR[field]) : undefined

  const failure = submission.error
  const failureText =
    failure instanceof ApiRequestError ? errorText(failure.code) : failure === null ? null : t('form.error.network')

  // Кнопка честная: пока нет фото и точки, она серая, а подпись говорит, чего не хватает,
  // а не «заполните все поля». Отключённой она при этом не становится — нажатие
  // переводит фокус на первое незаполненное поле, и отключённая кнопка это бы отняла.
  const ready = photos.length > 0 && point !== null
  const caption = submission.isPending
    ? t('form.submit.background')
    : ready
      ? t('home.ctaCaption')
      : t('form.submit.needs')

  return (
    <form onSubmit={submit} noValidate className="flex flex-1 flex-col">
      {/* Заголовок формы даёт окно, в котором она открыта: второй такой же строкой
          ниже он читался бы как сбой вёрстки (routes/$locale/new.tsx).

          Ноутбук делит форму на две колонки, как в макете: слева то, что человек уже
          держит в руке (снимок и точка), справа то, что дописывает словами. Группы
          заданы двумя обёртками, а не автопотоком сетки: автопоток разложил бы шаги
          через один — 01 слева, 02 справа. На телефоне обёртки просто складываются
          в одну колонку, и порядок шагов остаётся 01…05. */}
      <div className="flex flex-col gap-[var(--field-gap)] lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-[var(--s-8)]">
        {restored && (
          <div className="flex flex-wrap items-center gap-[var(--s-3)] rounded-[var(--r-4)] bg-[var(--surface-sunken)] p-[var(--s-4)] lg:col-span-2">
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
              className={COMPACT}
            >
              {t('form.draft.clear')}
            </button>
          </div>
        )}

        <div className="flex flex-col gap-[var(--field-gap)]">
          <div ref={(element) => void (anchors.current.photos = element)} tabIndex={-1}>
            <PhotoPicker photos={photos} onChange={setPhotos} error={errorFor('photos')} />
          </div>

          <div ref={(element) => void (anchors.current.point = element)} tabIndex={-1}>
            <PointPicker value={point} onChange={setPoint} error={errorFor('point')} />
          </div>
        </div>

        <div className="flex flex-col gap-[var(--field-gap)]">
        <div className="flex flex-col gap-[var(--s-3)]">
          <label htmlFor="landmark">
            <StepHeader step="03" label={t('form.step.landmark')} />
          </label>
          {/* Предупреждение стоит до поля, а не после: прочитать его имеет смысл
              прежде, чем человек напишет номер своей квартиры (PRD §12.10). В макете
              оно под полем — там оно опаздывает ровно на то, ради чего написано. */}
          <p id="landmark-hint" className="t-caption text-[var(--text-2)]">
            {t('form.landmark.hint')}
          </p>
          <input
            id="landmark"
            className={FIELD}
            value={landmark}
            maxLength={LANDMARK_MAX_LENGTH}
            aria-describedby="landmark-hint landmark-counter"
            onChange={(event) => setLandmark(event.target.value)}
          />
          <p id="landmark-counter" className="t-caption tabular-nums text-[var(--text-2)]">
            {landmark.length}/{LANDMARK_MAX_LENGTH}
          </p>
        </div>

        {/* Категория — плашки, а не список: пять значений помещаются на экран целиком,
            и выбор стоит одного касания вместо трёх. Внутри радиогруппа, поэтому
            стрелки и объявление «выбрано» приходят от браузера. */}
        <fieldset
          className="flex flex-col gap-[var(--s-3)] border-0 p-0"
          aria-describedby={invalid === 'category' ? 'category-error' : undefined}
        >
          <legend className="mb-[var(--s-2)] w-full">
            <StepHeader step="04" label={t('form.step.category')} />
          </legend>
          <CatalogState query={categories} />
          <div className="flex flex-wrap gap-[var(--s-2)] empty:hidden">
            {(categories.data ?? []).map((category, index) => (
              <ToggleChip
                key={category.code}
                type="radio"
                name="category"
                checked={categoryCode === category.code}
                onChange={() => setCategoryCode(category.code)}
                // Якорь фокуса — первая плашка: она же первая остановка обхода группы.
                ref={index === 0 ? (element) => void (anchors.current.category = element) : undefined}
              >
                {localizedName(category, locale)}
              </ToggleChip>
            ))}
          </div>
          {invalid === 'category' && (
            <p id="category-error" className="t-caption text-[var(--status-rejected-ink)]">
              {t('form.category.required')}
            </p>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-[var(--s-3)] border-0 p-0">
          <legend className="mb-[var(--s-2)] w-full">
            <StepHeader step="05" label={t('form.step.contacts')} optional />
          </legend>
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
            className={FIELD}
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
          />

          <label className="t-caption" htmlFor="telegram">
            {t('form.contacts.telegram')}
          </label>
          <input
            id="telegram"
            autoComplete="off"
            className={FIELD}
            value={contactTelegram}
            onChange={(event) => setContactTelegram(event.target.value)}
          />
        </fieldset>
        </div>

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
          <p
            role="alert"
            className="t-body rounded-[var(--r-4)] border border-[var(--status-rejected-line)] bg-[var(--status-rejected-tint)] p-[var(--s-4)] text-[var(--status-rejected-ink)] lg:col-span-2"
          >
            {failureText}
          </p>
        )}
      </div>

      {/* Подвал модала: слева подсказка, справа отмена и отправка (Desktop C).
          `flex-row-reverse` — потому что подсказка в разметке стоит после кнопок:
          она объясняет их, а не предваряет, и скринридер читает её в этом порядке. */}
      <ActionBar
        caption={caption}
        // Отрицательное поле гасит поле окна: разделитель подвала обязан пройти
        // во всю ширину модала, а не оборваться на его отступах.
        className="mx-[calc(var(--gutter)*-1)] lg:flex-row-reverse lg:items-center lg:justify-between lg:gap-[var(--s-5)]"
      >
        <div className="flex flex-col gap-[var(--s-2)] lg:flex-row lg:gap-[var(--s-3)]">
          <button type="button" onClick={onCancel} className={`${SECONDARY} lg:w-auto`}>
            {t('form.cancel')}
          </button>
          <button
            type="submit"
            disabled={submission.isPending}
            className={`${ready ? CTA : CTA_MUTED} lg:w-auto`}
          >
            {submission.isPending && (
              <span
                aria-hidden="true"
                className="h-[18px] w-[18px] animate-[rr-spin_.8s_linear_infinite] rounded-[var(--r-pill)] border-[2.5px] border-[rgba(18,22,28,.25)] border-t-[var(--asphalt-950)]"
              />
            )}
            {submission.isPending ? t('form.submitting') : submission.isError ? t('form.retry') : t('form.submit')}
          </button>
        </div>
      </ActionBar>
    </form>
  )
}
