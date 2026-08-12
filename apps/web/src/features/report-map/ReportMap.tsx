import type { ReportMapPoint, ReportStatus } from '@ravonroad/shared-types'
import { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'
import { basemapStyle, MAX_ZOOM, MIN_ZOOM } from '../../shared/map/basemap'
import { coverZoom, TASHKENT_BOUNDS, type Bounds } from '../../shared/map/tashkent'
import { LoadingState } from '../../shared/ui/state/LoadingState'
import { StatusMark } from '../../shared/ui/status/StatusMark'
import { isMapStatus, MARKER_LOOK, type MapStatus } from './markers'

const SOURCE = 'reports'

/** 40 экранных пикселей — порог склейки из AC-1: ближе этого две заявки на экране
 *  неразличимы пальцем, и показывать их порознь незачем. */
const CLUSTER_RADIUS = 40

/** Выше 17-го зума кластеров нет: пиксель там меньше метра, и заявки стоят порознь сами.
 *  Заодно это потолок для `getClusterExpansionZoom`: кластер, который не распадается
 *  ни на одном доступном зуме, был бы ловушкой — тап по нему ничего бы не менял. */
const CLUSTER_MAX_ZOOM = 17

/** Куда приближает выбор района и кнопка «моё местоположение» (US-031, US-002).
 *  Дальше 16-го не идём: дом виден, а искать заявку в пустом дворе не приходится. */
const FOCUS_MAX_ZOOM = 16

interface ReportMapProps {
  archiveUrl: string
  points: ReportMapPoint[]
  /** Словарь индексов статусов из того же ответа, что и точки (SRS §4.4). */
  statuses: ReportStatus[]
  selected: number | null
  onSelect: (number: number | null) => void
  /** Видимая область после каждого жеста — из неё собирается ключ запроса (bbox.ts). */
  onBoundsChange: (bounds: Bounds) => void
  /** Область, к которой карту нужно подогнать: район из фильтра или точка жителя.
   *  Новый объект = новая подгонка, поэтому значение должно быть стабильным. */
  focus: Bounds | null
}

interface ClusterEntry {
  key: string
  kind: 'cluster'
  clusterId: number
  count: number
}

interface PointEntry {
  key: string
  kind: 'point'
  number: number
  status: MapStatus
}

type MarkerEntry = (ClusterEntry | PointEntry) & { element: HTMLElement }

interface HeldMarker {
  marker: Marker
  element: HTMLElement
}

/** Минимальная форма GeoJSON, которую принимает источник карты. Пакет типов `geojson`
 *  лежит зависимостью maplibre-gl и напрямую из apps/web не резолвится, а заводить его
 *  отдельной зависимостью ради двух интерфейсов не за что. */
interface ReportFeature {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: { number: number; status: MapStatus }
}

interface ReportFeatureCollection {
  type: 'FeatureCollection'
  features: ReportFeature[]
}

function featureCollection(points: ReportMapPoint[], statuses: ReportStatus[]): ReportFeatureCollection {
  const features: ReportFeature[] = []
  for (const [longitude, latitude, statusIndex, number] of points) {
    const status = statuses[statusIndex]
    // Индекс приходит из ответа, а сервер бывает новее клиента. Точка со статусом,
    // которого клиент не знает, пропускается молча: покрасить её «каким-нибудь» цветом
    // хуже, чем не показать вовсе.
    if (status === undefined || !isMapStatus(status)) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties: { number, status },
    })
  }
  return { type: 'FeatureCollection', features }
}

/** Свойства прилетают из воркера кластеризации нетипизированными: у кластера свои
 *  (`cluster_id`, `point_count`), у заявки наши. Разбираем проверками, а не приведением
 *  типа — иначе первая же смена формата данных проявилась бы как `undefined` в разметке. */
function describe(properties: Record<string, unknown>): ClusterEntry | PointEntry | null {
  if (properties['cluster'] === true) {
    const clusterId = properties['cluster_id']
    const count = properties['point_count']
    if (typeof clusterId !== 'number' || typeof count !== 'number') return null
    return { key: `c${clusterId}`, kind: 'cluster', clusterId, count }
  }
  const number = properties['number']
  const status = properties['status']
  if (typeof number !== 'number' || typeof status !== 'string' || !isMapStatus(status)) return null
  return { key: `p${number}`, kind: 'point', number, status }
}

/** Публичная карта: точки, кластеры и выбор заявки.
 *
 *  Кластеры считает MapLibre по источнику GeoJSON (`cluster: true`), сервер отдаёт
 *  плоский список (SRS §3.4): на 2 ГБ пересчитывать кластеры на каждый жест зума нечем,
 *  а карта делает это в воркере даром.
 *
 *  Маркеры — элементы DOM, а не слой `symbol`. Причина не в красоте: слой с подписями
 *  требует шрифтовых PBF, которых нет ни в бакете, ни в репозитории (ADR-0008), и число
 *  внутри кластера рисовать было бы нечем. DOM-маркер заодно получает фокус с клавиатуры
 *  и подпись для скринридера, чего у отрисованного на GPU пятна нет (PRD §8.2).
 *  Их количество ограничено не числом заявок, а экраном: кластеризация склеивает всё,
 *  что ближе 40 пикселей, поэтому маркеров на экране сотни, а не тысячи. */
export default function ReportMap({
  archiveUrl,
  points,
  statuses,
  selected,
  onSelect,
  onBoundsChange,
  focus,
}: ReportMapProps) {
  const { t } = useI18n()
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<MapLibreMap | null>(null)
  const held = useRef(new Map<string, HeldMarker>())
  const [entries, setEntries] = useState<MarkerEntry[]>([])
  const [drawn, setDrawn] = useState(false)

  // Карта создаётся один раз, а колбэки и данные меняются на каждый рендер: эффект
  // читает их через ref, иначе пересоздание карты означало бы заново скачанные тайлы
  // на платном трафике.
  const latest = useRef({ onBoundsChange, data: featureCollection(points, statuses) })
  latest.current = { onBoundsChange, data: featureCollection(points, statuses) }

  useEffect(() => {
    const root = container.current
    if (root === null) return

    const instance = new MapLibreMap({
      container: root,
      style: basemapStyle(archiveUrl),
      center: [
        (TASHKENT_BOUNDS.minLon + TASHKENT_BOUNDS.maxLon) / 2,
        (TASHKENT_BOUNDS.minLat + TASHKENT_BOUNDS.maxLat) / 2,
      ],
      zoom: MIN_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      // Поворот выключен: заявкам он ничего не даёт, а вернуть карту на север
      // без компаса житель уже не сможет.
      dragRotate: false,
      // Подписи на карте нет вовсе: ODbL требует указать источник, но не требует делать
      // это поверх самой карты. Строка «© OpenStreetMap» стоит в подвале страницы
      // (`AppFooter`) — требование выполнено, а все четыре угла карты остаются рабочими:
      // переключатель «карта / список», кнопка геопозиции и пины ничем не закрыты.
      attributionControl: false,
    })
    instance.touchZoomRotate.disableRotation()
    map.current = instance

    // За границей экстракта данных нет — там чёрное поле, которое читается как поломка,
    // а не как край города. Поэтому окну не дают выйти за нарисованное: `maxBounds`
    // держит камеру внутри экстракта, а нижний зум считается так, чтобы город закрывал
    // окно целиком. Оба числа зависят от размера окна, поэтому пересчитываются на
    // каждом `resize`: на телефоне поворот экрана меняет их вдвое.
    instance.setMaxBounds([
      [TASHKENT_BOUNDS.minLon, TASHKENT_BOUNDS.minLat],
      [TASHKENT_BOUNDS.maxLon, TASHKENT_BOUNDS.maxLat],
    ])
    const fitFloor = (): void => {
      const zoom = coverZoom(TASHKENT_BOUNDS, root.clientWidth, root.clientHeight)
      // Нулевой размер окна даёт ноль — ставить его нижней границей нельзя: карта
      // отъехала бы в целый мир на первый же кадр до раскладки.
      if (zoom > 0) instance.setMinZoom(Math.min(zoom, MAX_ZOOM))
    }
    fitFloor()
    instance.on('resize', fitFloor)

    const reportBounds = (): void => {
      const bounds = instance.getBounds()
      latest.current.onBoundsChange({
        minLon: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLon: bounds.getEast(),
        maxLat: bounds.getNorth(),
      })
    }

    const sync = (): void => {
      const seen = new Set<string>()
      const next: MarkerEntry[] = []

      for (const feature of instance.querySourceFeatures(SOURCE)) {
        if (feature.geometry.type !== 'Point') continue
        const [longitude, latitude] = feature.geometry.coordinates
        if (longitude === undefined || latitude === undefined) continue
        const described = describe(feature.properties)
        // Одна и та же точка приходит из соседних тайлов дважды — маркер ей нужен один.
        if (described === null || seen.has(described.key)) continue
        seen.add(described.key)

        const existing = held.current.get(described.key)
        if (existing === undefined) {
          const element = document.createElement('div')
          // Зона нажатия шире рисунка: WCAG 2.2 требует 24×24, у нас 44 (PRD §8.2).
          element.style.width = 'var(--pin-hit)'
          element.style.height = 'var(--pin-hit)'
          element.style.display = 'grid'
          element.style.placeItems = 'center'
          const marker = new Marker({ element, anchor: 'center' }).setLngLat([longitude, latitude]).addTo(instance)
          held.current.set(described.key, { marker, element })
          next.push({ ...described, element })
        } else {
          existing.marker.setLngLat([longitude, latitude])
          next.push({ ...described, element: existing.element })
        }
      }

      for (const [key, marker] of held.current) {
        if (seen.has(key)) continue
        marker.marker.remove()
        held.current.delete(key)
      }

      setEntries(next)
    }

    // `load` наступает, когда разобран стиль, а не когда видна карта: PMTiles ходит
    // за тайлом четырьмя последовательными range-запросами, и первая картинка приходит
    // секунд через десять. `idle` — первый момент, когда рисовать уже нечего.
    instance.once('idle', () => setDrawn(true))
    instance.on('load', () => {
      instance.addSource(SOURCE, {
        type: 'geojson',
        data: latest.current.data,
        cluster: true,
        clusterRadius: CLUSTER_RADIUS,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
      })
      // Невидимый слой — обязателен, а не декорация: MapLibre грузит тайлы источника
      // только под слой, который на него ссылается. Без него источник хранит точки,
      // `querySourceFeatures` возвращает пустоту, и маркеров на карте не появляется
      // ни одного — молча, без единой строки в консоли. Рисуют пины элементы DOM,
      // поэтому слою здесь остаётся только одна работа: заставить кластеризацию считать.
      instance.addLayer({
        id: `${SOURCE}-anchor`,
        type: 'circle',
        source: SOURCE,
        paint: { 'circle-radius': 1, 'circle-opacity': 0 },
      })
      // Житель, не давший геопозицию, видит город целиком, а не «где-то в Ташкенте»
      // (US-002). Подгонка идёт после загрузки, а не параметром `bounds` конструктора:
      // с ним карта не доходит до события `load` вовсе — стиль остаётся неразобранным,
      // источник не добавляется, и маркеров не появляется ни одного, молча.
      instance.fitBounds(
        [
          [TASHKENT_BOUNDS.minLon, TASHKENT_BOUNDS.minLat],
          [TASHKENT_BOUNDS.maxLon, TASHKENT_BOUNDS.maxLat],
        ],
        { duration: 0 },
      )
      reportBounds()
    })
    instance.on('moveend', () => {
      reportBounds()
      sync()
    })
    // Точки приходят и после жеста: сначала ответ API, потом пересчёт кластеров
    // в воркере. Без этого маркеры появлялись бы только после следующего движения.
    instance.on('sourcedata', (event) => {
      if (event.sourceId === SOURCE && event.isSourceLoaded) sync()
    })

    return () => {
      instance.remove()
      map.current = null
      held.current.clear()
    }
  }, [archiveUrl])

  useEffect(() => {
    const source = map.current?.getSource(SOURCE)
    if (source instanceof GeoJSONSource) source.setData(featureCollection(points, statuses))
  }, [points, statuses])

  useEffect(() => {
    if (focus === null) return
    map.current?.fitBounds(
      [
        [focus.minLon, focus.minLat],
        [focus.maxLon, focus.maxLat],
      ],
      { maxZoom: FOCUS_MAX_ZOOM, padding: 24 },
    )
  }, [focus])

  const expand = (clusterId: number): void => {
    const instance = map.current
    if (instance === null) return
    const source = instance.getSource(SOURCE)
    if (!(source instanceof GeoJSONSource)) return
    const marker = held.current.get(`c${clusterId}`)
    if (marker === undefined) return
    void source
      .getClusterExpansionZoom(clusterId)
      .then((zoom) => instance.easeTo({ center: marker.marker.getLngLat(), zoom }))
      // Кластер мог рассыпаться, пока палец шёл к экрану: тогда приближать нечего,
      // и это не ошибка, о которой стоит говорить жителю.
      .catch(() => undefined)
  }

  return (
    <>
      <div ref={container} className="h-full w-full" />
      {/* Пустой серый прямоугольник житель читает как поломку, а не как загрузку. */}
      {!drawn && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[var(--surface-sunken)]">
          <LoadingState />
        </div>
      )}
      {entries.map((entry) =>
        createPortal(
          entry.kind === 'cluster' ? (
            <button
              type="button"
              onClick={() => expand(entry.clusterId)}
              // Число рядом с подписью, а не «12 заявок»: согласование числительного
              // с существительным в русском зависит от самого числа, и собранная
              // из кусков строка врала бы на каждом втором кластере.
              aria-label={`${t('map.cluster.label')}: ${formatNumber(entry.count)}`}
              className="grid h-full w-full place-items-center"
            >
              {/* Кластер — всегда круг и никогда не цвет статуса: он считает заявки,
                  а не сообщает их состояние. Смесь статусов внутри одним цветом
                  не описывается, и попытка описать её врала бы. */}
              <span
                // Кластер инвертируется вместе с подложкой: на тёмной карте он светлый,
                // на светлой тёмный. Обводка берёт цвет страницы, а не белый: белое
                // кольцо вокруг белого кружка на тёмной карте не читается.
                className="t-label grid h-[var(--cluster-size)] min-w-[var(--cluster-size)] place-items-center rounded-[var(--r-pill)] border-2 border-[var(--surface-page)] bg-[var(--text-1)] px-[var(--s-2)] text-[var(--surface-page)] tabular-nums shadow-[var(--e-pin)]"
              >
                {formatNumber(entry.count)}
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onSelect(entry.number)}
              aria-pressed={selected === entry.number}
              aria-label={`${t('map.marker.label')} ${entry.number}, ${t(`status.${entry.status}`)}`}
              className="grid h-full w-full place-items-center"
            >
              <span
                className="grid place-items-center text-[var(--pin-stroke)]"
                style={{
                  background: MARKER_LOOK[entry.status].color,
                  borderRadius: 'var(--pin-radius)',
                  transform: 'rotate(-45deg)',
                  border: selected === entry.number ? 'var(--pin-border-selected)' : 'var(--pin-border)',
                  boxShadow: selected === entry.number ? 'var(--e-pin-selected)' : 'var(--e-pin)',
                  width: selected === entry.number ? 'var(--pin-size-selected)' : 'var(--pin-size)',
                  height: selected === entry.number ? 'var(--pin-size-selected)' : 'var(--pin-size)',
                }}
              >
                {/* Обратный поворот: капля наклонена, форма статуса — нет. Она носит
                    смысл, и наклонённая галочка перестаёт быть галочкой. */}
                <span className="grid place-items-center" style={{ transform: 'rotate(45deg)' }}>
                  <StatusMark status={entry.status} />
                </span>
              </span>
            </button>
          ),
          entry.element,
          entry.key,
        ),
      )}
    </>
  )
}
