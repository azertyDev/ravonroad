import { lazy, Suspense, useId, useState } from 'react'
import { useI18n } from '../../../shared/i18n/useI18n'
import { StepHeader } from '../../../shared/ui/control/StepHeader'
import { COMPACT } from '../../../shared/ui/control/styles'
import { Glyph } from '../../../shared/ui/icon/Glyph'
import { roundCoordinate, type Point } from './coordinates'

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

/** Выбор точки: карта и кнопка «моё местоположение» поверх одного состояния (US-007).
 *
 *  Числовых полей широты и долготы здесь больше нет — их убрали по решению владельца
 *  продукта: пара координат в форме для жителя это шум, а не подстраховка. Путь без
 *  мыши при этом обязан остаться, поэтому сам пин фокусируется и ходит стрелками
 *  (`MapPin`): «моё местоположение» им не замена — оно требует защищённого контекста
 *  и разрешения, которых у человека может не быть.
 *
 *  Отказ в геопозиции форму не блокирует: точка ставится пальцем по карте. */
export function PointPicker({ value, onChange, error }: PointPickerProps) {
  const { t } = useI18n()
  const fieldId = useId()
  const [locating, setLocating] = useState<Locating>('idle')
  const archiveUrl = import.meta.env.VITE_MAP_PMTILES_URL

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
            <MapPin
              archiveUrl={archiveUrl}
              value={value}
              onChange={onChange}
              keyboardLabel={t('form.point.pin')}
              mapLabel={t('form.point.mapLabel')}
            />
          </Suspense>
        </div>
      )}

      <button type="button" onClick={locate} className={COMPACT}>
        <Glyph name="locate" size={14} />
        {locating === 'pending' ? t('form.point.locating') : t('form.point.myLocation')}
      </button>

      {locating === 'denied' && <p className="t-caption text-[var(--text-2)]">{t('form.point.denied')}</p>}

      {/* Про стрелки написано текстом, а не только в `aria-label` пина: человек
          за клавиатурой видит подсказку так же, как скринридер её читает. */}
      <p className="t-caption text-[var(--text-2)]">{t('form.point.keyboardHint')}</p>

      {error !== undefined && (
        <p id={errorId} className="t-caption text-[var(--status-rejected-ink)]">
          {error}
        </p>
      )}
    </fieldset>
  )
}
