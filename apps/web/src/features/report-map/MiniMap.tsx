import { Map as MapLibreMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { basemapStyle, MAX_ZOOM, MIN_ZOOM } from '../../shared/map/basemap'

/** Квартал вокруг ямы: дом виден, а искать её в пустом дворе не приходится. */
const ZOOM = 16

interface MiniMapProps {
  archiveUrl: string
  latitude: number
  longitude: number
}

/** Место заявки одним кадром: карта без единого органа управления.
 *
 *  `interactive: false` — не украшение, а смысл блока: он отвечает на вопрос «где это»,
 *  а не заменяет карту города. Уехавшая случайным жестом мини-карта перестала бы
 *  отвечать и на него, а вернуть её было бы нечем.
 *
 *  Пина здесь нет: карта отцентрована на заявке, поэтому он рисуется разметкой ровно
 *  в середине контейнера (ReportSummary). Маркер MapLibre понадобился бы, только если
 *  бы карту можно было сдвинуть. */
export default function MiniMap({ archiveUrl, latitude, longitude }: MiniMapProps) {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = container.current
    if (root === null) return

    const map = new MapLibreMap({
      container: root,
      style: basemapStyle(archiveUrl),
      center: [longitude, latitude],
      zoom: ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      interactive: false,
      // Подписи на карте нет: источник указан строкой в подвале страницы (`AppFooter`),
      // и в кадре размером с квартал значок «i» занимал бы половину дома.
      attributionControl: false,
    })

    return () => map.remove()
  }, [archiveUrl, latitude, longitude])

  return <div ref={container} className="h-full w-full" />
}
