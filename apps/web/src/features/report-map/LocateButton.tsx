import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { catalogKeys, fetchDistricts } from '../../entities/catalog/api'
import { useI18n } from '../../shared/i18n/useI18n'
import type { Bounds } from '../../shared/map/tashkent'
import { around, insideAny } from './bbox'

/** 10 секунд — столько же, сколько в форме подачи (SRS §7.4). Дальше ждать нечего:
 *  житель стоит на улице, а карта города у него уже открыта. */
const TIMEOUT = 10_000

type State = 'idle' | 'pending' | 'denied' | 'outside'

interface LocateButtonProps {
  onLocated: (bounds: Bounds) => void
}

/** «Моё местоположение» (US-002).
 *
 *  Отказ в доступе — не сбой: карта уже показывает весь Ташкент, и всё, что нужно
 *  сказать жителю, это что она никуда не поедет. Сообщение об ошибке здесь было бы
 *  враньём — ничего не сломалось.
 *
 *  Позиция вне города тоже не сбой: человек может смотреть карту из Самарканда.
 *  Карта остаётся на Ташкенте, а рядом появляется рамка кампании. Проверка
 *  приблизительная, по прямоугольникам районов — точную всё равно делает сервер
 *  при создании заявки (SRS §3.3). */
export function LocateButton({ onLocated }: LocateButtonProps) {
  const { t, errorText } = useI18n()
  const [state, setState] = useState<State>('idle')
  const districts = useQuery({
    queryKey: catalogKeys.districts,
    queryFn: fetchDistricts,
    staleTime: Infinity,
  })

  const locate = (): void => {
    setState('pending')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords
        const areas = (districts.data ?? []).map((district) => district.bbox)
        // Справочник ещё не приехал — двигаем карту: это ровно то, о чём попросили,
        // а рамки кампании житель узнает от сервера, когда дойдёт до заявки.
        if (areas.length > 0 && !insideAny(areas, longitude, latitude)) {
          setState('outside')
          return
        }
        setState('idle')
        onLocated(around(longitude, latitude))
      },
      () => setState('denied'),
      { enableHighAccuracy: true, timeout: TIMEOUT },
    )
  }

  return (
    <div className="flex flex-col items-start gap-[var(--s-2)]">
      <button
        type="button"
        onClick={locate}
        className="t-label inline-flex min-h-[var(--touch-base)] items-center rounded-[var(--r-2)] border border-[var(--border-2)] bg-[var(--surface-card)] px-[var(--s-4)] shadow-[var(--e-2)]"
      >
        {state === 'pending' ? t('map.locating') : t('map.locate')}
      </button>

      {/* role="status", а не просто текст: подсказка появляется после нажатия, и без
          объявления пользователь скринридера решил бы, что кнопка не сработала. */}
      {(state === 'denied' || state === 'outside') && (
        <p
          role="status"
          className="t-caption max-w-[28ch] rounded-[var(--r-2)] bg-[var(--surface-card)] px-[var(--s-3)] py-[var(--s-2)] text-[var(--text-2)] shadow-[var(--e-2)]"
        >
          {state === 'denied' ? t('map.locate.denied') : errorText('OUTSIDE_TASHKENT')}
        </p>
      )}
    </div>
  )
}
