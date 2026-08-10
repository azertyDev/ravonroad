import { Map as MapLibreMap, Marker, type LngLat } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { basemapStyle, MAX_ZOOM, MIN_ZOOM } from '../../../shared/map/basemap'
import { roundCoordinate, TASHKENT_CENTER, type Point } from './coordinates'

const ZOOM = 16

interface MapPinProps {
  archiveUrl: string
  value: Point | null
  onChange: (point: Point) => void
}

/** Виджет выбора точки: тянет координаты внутрь, отдаёт координаты наружу. Ничего
 *  больше наружу не торчит — провайдера карты меняли уже дважды. */
export default function MapPin({ archiveUrl, value, onChange }: MapPinProps) {
  const container = useRef<HTMLDivElement>(null)
  const marker = useRef<Marker | null>(null)
  const latest = useRef(onChange)
  latest.current = onChange

  useEffect(() => {
    const root = container.current
    if (root === null) return

    const start = value ?? TASHKENT_CENTER

    const report = (lngLat: LngLat): void => {
      latest.current({
        longitude: roundCoordinate(lngLat.lng),
        latitude: roundCoordinate(lngLat.lat),
      })
    }

    const map = new MapLibreMap({
      container: root,
        style: basemapStyle(archiveUrl),
        center: [start.longitude, start.latitude],
        zoom: ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        // Поворот выключен: выбору точки он ничего не даёт, а вернуть карту на север
        // без компаса житель уже не сможет.
        dragRotate: false,
        attributionControl: { compact: true },
      })
    map.touchZoomRotate.disableRotation()

    // Свой элемент, а не встроенный маркер MapLibre: тот рисует свою синюю каплю и
    // принимает цвет строкой в SVG-атрибут `fill`, где `var()` не резолвится. Форму
    // терять нельзя — при дейтеранопии статусы различаются ею, а не цветом
    // (colors.css). Переменные в inline-стилях читаются живыми, и смена темы
    // доезжает до пина сама.
    const pin = document.createElement('div')
    // Позицию задаёт Marker: он пишет свой transform, и наш здесь был бы стёрт.
    pin.style.width = 'var(--pin-size-selected)'
    pin.style.height = 'var(--pin-size-selected)'
    pin.style.background = 'var(--status-new-pin)'
    pin.style.border = 'var(--pin-border-selected)'
    pin.style.borderRadius = 'var(--r-pill) var(--r-pill) var(--r-1) var(--r-pill)'
    pin.style.boxShadow = 'var(--e-pin-selected)'
    pin.style.cursor = 'grab'
    // Иначе палец, потянувший пин, прокрутит страницу вместо перетаскивания.
    pin.style.touchAction = 'none'

    const entity = new Marker({ element: pin, anchor: 'bottom', draggable: true })
      .setLngLat([start.longitude, start.latitude])
      .addTo(map)
    entity.on('dragend', () => report(entity.getLngLat()))
    marker.current = entity

    // Тап ставит пин туда, куда попал палец: перетаскивание требует прицелиться дважды.
    map.on('click', (event) => report(event.lngLat))

    return () => {
      map.remove()
      marker.current = null
    }
    // Карта создаётся один раз: значение ниже двигает существующий маркер, а пересоздание
    // означало бы заново скачанные тайлы на платном трафике.
  }, [])

  // Поля широты и долготы и кнопка «моё местоположение» двигают тот же пин.
  useEffect(() => {
    if (value !== null) marker.current?.setLngLat([value.longitude, value.latitude])
  }, [value])

  return (
    <div
      ref={container}
      className="h-[240px] w-full overflow-hidden rounded-[var(--r-3)] border border-[var(--border-1)]"
    />
  )
}
