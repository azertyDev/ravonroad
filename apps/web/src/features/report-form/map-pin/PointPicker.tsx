import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../../../shared/i18n/useI18n'
import { StepHeader } from '../../../shared/ui/control/StepHeader'
import { COMPACT, FIELD } from '../../../shared/ui/control/styles'
import { Glyph } from '../../../shared/ui/icon/Glyph'
import { formatCoordinate, parseCoordinate, roundCoordinate, type Point } from './coordinates'

/** MapLibre и стиль карты грузятся только здесь и только по требованию: на маршрутах
 *  без карты ни байта из них не попадает в первую загрузку (SRS §7.4, PRD §8.1). */
const MapPin = lazy(() => import('./MapPin'))

interface PointPickerProps {
  value: Point | null
  onChange: (point: Point | null) => void
  /** Текст ошибки поля; связывается с блоком программно, а не цветом (PRD §8.2). */
  error?: string | undefined
}

type Locating = 'idle' | 'pending' | 'denied'

/** Выбор точки: карта, кнопка «моё местоположение» и два числовых поля — всё поверх
 *  одного состояния (US-007).
 *
 *  Поля не «запасной вариант для незрячих», а равноправный путь: перетаскивание пальцем
 *  недоступно и с клавиатуры, и при треморе, и когда карта не загрузилась в метро.
 *  Отказ в геопозиции форму не блокирует — он просто оставляет поля пустыми.
 *
 *  Карта не сворачивается после выбора, хотя в макете на её месте появляется строка
 *  с адресом: адреса у нас нет — обратного геокодирования в системе не существует, —
 *  и на месте карты осталась бы пара координат, по которой поправить промах на десять
 *  метров невозможно. */
export function PointPicker({ value, onChange, error }: PointPickerProps) {
  const { t } = useI18n()
  const fieldId = useId()
  const [latitudeText, setLatitudeText] = useState(value === null ? '' : formatCoordinate(value.latitude))
  const [longitudeText, setLongitudeText] = useState(value === null ? '' : formatCoordinate(value.longitude))
  const [locating, setLocating] = useState<Locating>('idle')
  const archiveUrl = import.meta.env.VITE_MAP_PMTILES_URL

  // Пин передвинули на карте или кнопкой — поля показывают то же самое. Эффект
  // зависит только от значения, а тексты полей читает через ref: включи их в зависимости,
  // и он гонялся бы сам за собой на каждой набранной цифре.
  const typed = useRef({ latitudeText, longitudeText })
  typed.current = { latitudeText, longitudeText }

  useEffect(() => {
    if (value === null) return
    const { latitudeText: latitude, longitudeText: longitude } = typed.current
    if (parseCoordinate(latitude) !== value.latitude) setLatitudeText(formatCoordinate(value.latitude))
    if (parseCoordinate(longitude) !== value.longitude) setLongitudeText(formatCoordinate(value.longitude))
  }, [value])

  const applyText = (latitude: string, longitude: string): void => {
    const parsedLatitude = parseCoordinate(latitude)
    const parsedLongitude = parseCoordinate(longitude)
    onChange(
      parsedLatitude === null || parsedLongitude === null
        ? null
        : { latitude: parsedLatitude, longitude: parsedLongitude },
    )
  }

  const locate = (): void => {
    setLocating('pending')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating('idle')
        onChange({
          latitude: roundCoordinate(position.coords.latitude),
          longitude: roundCoordinate(position.coords.longitude),
        })
      },
      // Отказ — не ошибка формы: житель ставит точку сам, и форма остаётся рабочей.
      () => setLocating('denied'),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const errorId = `${fieldId}-error`

  return (
    <fieldset
      className="flex flex-col gap-[var(--s-3)] border-0 p-0"
      aria-describedby={error === undefined ? undefined : errorId}
    >
      <legend className="mb-[var(--s-2)] w-full">
        <StepHeader
          step="02"
          label={t('form.step.point')}
          aside={
            value === null ? undefined : (
              <span className="t-chip text-[var(--status-done-ink)]">{t('form.point.marked')}</span>
            )
          }
        />
      </legend>

      {/* Тайлов нет — карты нет, и никакого пустого прямоугольника на её месте:
          сразу показывается тот путь выбора точки, который работает (PRD §8.2). */}
      {archiveUrl !== undefined && archiveUrl !== '' && (
        <div className="relative">
          <Suspense fallback={null}>
            <MapPin archiveUrl={archiveUrl} value={value} onChange={onChange} />
          </Suspense>
          {/* Подсказка лежит на карте, а не под ней: она объясняет ровно тот жест,
              который делают пальцем прямо здесь. */}
          <p className="t-caption pointer-events-none absolute inset-x-[var(--s-3)] bottom-[var(--s-3)] rounded-[var(--r-3)] bg-[rgba(18,22,28,.82)] px-[var(--s-3)] py-[var(--s-2)] text-[#FBFBFD]">
            {t('form.point.hint')}
          </p>
        </div>
      )}

      <button type="button" onClick={locate} className={COMPACT}>
        <Glyph name="locate" size={14} />
        {locating === 'pending' ? t('form.point.locating') : t('form.point.myLocation')}
      </button>

      {locating === 'denied' && <p className="t-caption text-[var(--text-2)]">{t('form.point.denied')}</p>}

      <div className="flex gap-[var(--s-3)]">
        <div className="flex flex-1 flex-col gap-[var(--s-1)]">
          <label className="t-caption text-[var(--text-2)]" htmlFor={`${fieldId}-lat`}>
            {t('form.point.latitude')}
          </label>
          <input
            id={`${fieldId}-lat`}
            className={`${FIELD} tabular-nums`}
            // inputMode вместо type="number": на телефоне нужна цифровая клавиатура
            // с точкой, а стрелки и колесо type="number" на координатах только мешают.
            inputMode="decimal"
            autoComplete="off"
            value={latitudeText}
            onChange={(event) => {
              setLatitudeText(event.target.value)
              applyText(event.target.value, longitudeText)
            }}
          />
        </div>

        <div className="flex flex-1 flex-col gap-[var(--s-1)]">
          <label className="t-caption text-[var(--text-2)]" htmlFor={`${fieldId}-lon`}>
            {t('form.point.longitude')}
          </label>
          <input
            id={`${fieldId}-lon`}
            className={`${FIELD} tabular-nums`}
            inputMode="decimal"
            autoComplete="off"
            value={longitudeText}
            onChange={(event) => {
              setLongitudeText(event.target.value)
              applyText(latitudeText, event.target.value)
            }}
          />
        </div>
      </div>

      {error !== undefined && (
        <p id={errorId} className="t-caption text-[var(--status-rejected-ink)]">
          {error}
        </p>
      )}
    </fieldset>
  )
}
