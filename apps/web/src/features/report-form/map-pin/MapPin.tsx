import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../../shared/i18n/useI18n'
import { roundCoordinate, TASHKENT_CENTER, type Point } from './coordinates'
import { loadYandexMaps, type Coordinates, type YMapInstance, type YMapMarkerInstance } from './loadYandexMaps'

const ZOOM = 16

interface MapPinProps {
  value: Point | null
  onChange: (point: Point) => void
}

function toCoordinates(point: Point): Coordinates {
  return [point.longitude, point.latitude]
}

/** Виджет выбора точки: перетаскиваемый пин и тайлы Яндекса (SRS §7.4).
 *
 *  Карта — удобство, а не единственный путь: рядом стоят кнопка «моё местоположение»
 *  и два числовых поля, и форма работает целиком без неё (PRD §8.2). Поэтому отказ
 *  загрузки здесь показывается сообщением и ничего не блокирует.
 *
 *  Карта создаётся один раз и живёт в ref: пересоздавать её на каждую перерисовку
 *  React значило бы заново скачивать тайлы на платном мобильном трафике. */
export default function MapPin({ value, onChange }: MapPinProps) {
  const { locale, t } = useI18n()
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<YMapInstance | null>(null)
  const marker = useRef<YMapMarkerInstance | null>(null)
  const [failed, setFailed] = useState(false)

  // Свежие значения для колбэков карты: они переживают перерисовки, а карта — нет.
  const latestChange = useRef(onChange)
  const initialPoint = useRef(value)
  latestChange.current = onChange

  useEffect(() => {
    const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY
    const root = container.current
    if (apiKey === undefined || apiKey === '' || root === null) {
      setFailed(true)
      return
    }

    let disposed = false
    const center = toCoordinates(initialPoint.current ?? TASHKENT_CENTER)

    const report = (coordinates: Coordinates): void => {
      latestChange.current({
        longitude: roundCoordinate(coordinates[0]),
        latitude: roundCoordinate(coordinates[1]),
      })
    }

    loadYandexMaps(apiKey, locale === 'ru' ? 'ru_RU' : 'uz_UZ')
      .then((ymaps3) => {
        if (disposed) return

        const instance = new ymaps3.YMap(root, { location: { center, zoom: ZOOM } })
        instance.addChild(new ymaps3.YMapDefaultSchemeLayer({}))
        instance.addChild(new ymaps3.YMapDefaultFeaturesLayer({}))

        const pin = document.createElement('div')
        pin.style.width = 'var(--pin-size-selected)'
        pin.style.height = 'var(--pin-size-selected)'
        pin.style.transform = 'translate(-50%, -100%)'
        pin.style.background = 'var(--status-new-pin)'
        pin.style.border = 'var(--pin-border-selected)'
        pin.style.borderRadius = 'var(--r-pill) var(--r-pill) var(--r-1) var(--r-pill)'
        pin.style.boxShadow = 'var(--e-pin-selected)'

        const entity = new ymaps3.YMapMarker(
          { coordinates: center, draggable: true, onDragEnd: report },
          pin,
        )
        instance.addChild(entity)
        marker.current = entity

        // Тап по карте ставит пин туда, куда попал палец: перетаскивание требует
        // прицелиться дважды — сначала в сам пин, потом в место.
        instance.addChild(
          new ymaps3.YMapListener({
            layer: 'any',
            onFastClick: (_object, event) => report(event.coordinates),
          }),
        )

        map.current = instance
      })
      .catch(() => {
        if (!disposed) setFailed(true)
      })

    return () => {
      disposed = true
      map.current?.destroy()
      map.current = null
      marker.current = null
    }
  }, [locale])

  // Числовые поля и кнопка «моё местоположение» двигают тот же пин: состояние одно,
  // и карта обязана показывать именно его (US-007).
  useEffect(() => {
    if (value === null) return
    const coordinates = toCoordinates(value)
    marker.current?.update({ coordinates })
    map.current?.setLocation({ center: coordinates, duration: 200 })
  }, [value])

  if (failed) {
    return (
      <p className="t-caption rounded-[var(--r-3)] bg-[var(--surface-sunken)] p-[var(--s-4)] text-[var(--text-2)]">
        {t('form.map.unavailable')}
      </p>
    )
  }

  return (
    <div
      ref={container}
      className="h-[240px] w-full overflow-hidden rounded-[var(--r-3)] border border-[var(--border-1)]"
    />
  )
}
