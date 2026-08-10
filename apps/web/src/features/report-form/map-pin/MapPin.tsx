import 'maplibre-gl/dist/maplibre-gl.css'
import { addProtocol, Map as MapLibreMap, Marker, type LngLat, type MapMouseEvent } from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useEffect, useRef } from 'react'
import { roundCoordinate, TASHKENT_CENTER, type Point } from './coordinates'

const ZOOM = 16

/** PMTiles — один файл в нашем же бакете, браузер читает его range-запросами.
 *  Ни ключей, ни лимитов, ни чужого API на пути жителя к форме. Протокол регистрируется
 *  один раз на страницу. */
addProtocol('pmtiles', new Protocol().tile)

interface MapPinProps {
  styleUrl: string
  value: Point | null
  onChange: (point: Point) => void
}

/** Виджет выбора точки: тянет координаты внутрь, отдаёт координаты наружу. Ничего
 *  больше наружу не торчит — провайдера карты меняли уже дважды. */
export default function MapPin({ styleUrl, value, onChange }: MapPinProps) {
  const container = useRef<HTMLDivElement>(null)
  const marker = useRef<Marker | null>(null)
  const latest = useRef(onChange)
  latest.current = onChange

  useEffect(() => {
    const root = container.current
    if (root === null) return

    const start = value ?? TASHKENT_CENTER
    const map = new MapLibreMap({
      container: root,
      style: styleUrl,
      center: [start.longitude, start.latitude],
      zoom: ZOOM,
      attributionControl: { compact: true },
    })

    const report = (lngLat: LngLat): void => {
      latest.current({
        longitude: roundCoordinate(lngLat.lng),
        latitude: roundCoordinate(lngLat.lat),
      })
    }

    const pin = new Marker({ draggable: true, color: 'var(--status-new-pin)' })
      .setLngLat([start.longitude, start.latitude])
      .addTo(map)
    pin.on('dragend', () => report(pin.getLngLat()))
    marker.current = pin

    // Тап ставит пин туда, куда попал палец: перетаскивание требует прицелиться дважды.
    map.on('click', (event: MapMouseEvent) => report(event.lngLat))

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
