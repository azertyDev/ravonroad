import { Map as MapLibreMap, Marker, type LngLat } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { basemapStyle, MAX_ZOOM, MIN_ZOOM } from '../../../shared/map/basemap'
import { LoadingState } from '../../../shared/ui/state/LoadingState'
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
  const [drawn, setDrawn] = useState(false)
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
    // Первый тайл приходит через несколько секунд: PMTiles читает заголовок, каталог
    // и лист последовательно. До этого показывается загрузка, а не пустой прямоугольник.
    map.once('idle', () => setDrawn(true))

    // Свой элемент, а не встроенный маркер MapLibre: тот рисует свою синюю каплю и
    // принимает цвет строкой в SVG-атрибут `fill`, где `var()` не резолвится. Форму
    // терять нельзя — при дейтеранопии статусы различаются ею, а не цветом
    // (colors.css). Переменные в inline-стилях читаются живыми, и смена темы
    // доезжает до пина сама.
    // Два элемента, а не один, и это не украшение. Внешний отдаётся MapLibre, и на нём
    // не должно быть ни одного собственного преобразования: `rotate` — отдельное
    // свойство, применяемое ДО `transform`, поэтому написанный маркером
    // `translate(539px, 97px)` выполнялся в повёрнутой на 45° системе координат.
    // Пин уезжал на триста пикселей выше карты и ходил по диагонали: курсор вправо —
    // пин вверх. Форму поэтому поворачивает внутренний элемент.
    const pin = document.createElement('div')
    pin.style.width = 'var(--pin-size-selected)'
    pin.style.height = 'var(--pin-size-selected)'
    pin.style.cursor = 'grab'
    // Иначе палец, потянувший пин, прокрутит страницу вместо перетаскивания.
    pin.style.touchAction = 'none'

    const drop = document.createElement('div')
    drop.style.width = '100%'
    drop.style.height = '100%'
    drop.style.background = 'var(--status-new-pin)'
    drop.style.border = 'var(--pin-border-selected)'
    // Та же капля, что на публичной карте: жёсткий угол внизу слева, повёрнутый вниз.
    drop.style.borderRadius = 'var(--pin-radius)'
    drop.style.rotate = '-45deg'
    drop.style.boxShadow = 'var(--e-pin-selected)'
    pin.append(drop)

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
    // Выше макета (150 на телефоне): точку ставят пальцем, и на 150 пикселях видно
    // два квартала — прицелиться в конкретную яму невозможно.
    <div className="relative h-[280px] w-full overflow-hidden rounded-[var(--r-4)] border border-[var(--border-1)] md:h-[340px]">
      <div ref={container} className="h-full w-full" />
      {!drawn && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--surface-sunken)]">
          <LoadingState />
        </div>
      )}
    </div>
  )
}
