import 'maplibre-gl/dist/maplibre-gl.css'
import {
  addProtocol,
  importScriptInWorkers,
  Map as MapLibreMap,
  Marker,
  prewarm,
  setWorkerUrl,
  type LngLat,
  type MapOptions,
} from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import pmtilesProtocolUrl from './pmtilesProtocol?worker&url'
import { Protocol } from 'pmtiles'
import { useEffect, useRef } from 'react'
import { roundCoordinate, TASHKENT_CENTER, type Point } from './coordinates'

const ZOOM = 16
/** Экстракт вырезан по границе Ташкента: дальше отъезжать некуда, там пусто. */
const MIN_ZOOM = 10
/** Тайлы кончаются на 15-м, дальше MapLibre растягивает их сам — и это ещё читаемо. */
const MAX_ZOOM = 19

/** Подложка обязана молчать: единственное яркое пятно на ней — пин жителя. Цвета сняты
 *  со шкалы asphalt (shared/styles/tokens/colors.css), числами, а не переменными:
 *  стиль MapLibre — это JSON, до CSS он не дотягивается. Тема здесь одна, светлая:
 *  тёмная подложка потребовала бы второго набора и переключения по prefers-color-scheme,
 *  а карта тут — фон под пин, а не предмет разглядывания. */
const OUTSIDE = '#E6E8EE' // asphalt-100 — за границей города данных нет
const EARTH = '#F8F9FB' // surface-sunken — город светлее окраины, и край данных виден сам
const GREEN = '#E7EDE7'
const WATER = '#CCDCE8'
const BUILDING = '#E6E8EE' // asphalt-100
const ROAD = '#B4BAC7' // asphalt-300 — на ступень темнее кварталов, иначе сетка улиц
const BOUNDARY = '#8F97A8' // asphalt-400  не читается на 240 пикселях высоты

/** Зелень OSM приходит десятком видов; красить каждый по-своему значит спорить с пином. */
const GREEN_KINDS = [
  'park',
  'garden',
  'grass',
  'grassland',
  'meadow',
  'wood',
  'forest',
  'scrub',
  'nature_reserve',
  'national_park',
  'cemetery',
  'pitch',
  'playground',
]

const WATERWAY_KINDS = ['river', 'canal', 'stream', 'ditch']

/** PMTiles — один файл в нашем же бакете, браузер читает его range-запросами.
 *  Ни ключей, ни лимитов, ни чужого API на пути жителя к форме. Протокол регистрируется
 *  один раз на страницу, а модуль грузится лениво: на маршрутах без карты не выполняется. */
addProtocol('pmtiles', new Protocol().tile)

/** Свой воркер MapLibre ищет сам, собирая путь из `import.meta.url` и переменной, —
 *  статически такой адрес не разрешает ни один сборщик, и в собранном виде запрос уходит
 *  на /assets/maplibre-gl-worker.mjs, которого там нет. В dev-сервере это незаметно:
 *  Vite отдаёт файл прямо из node_modules по тому же относительному пути. Поэтому адрес
 *  задаётся явно: `?worker&url` заставляет Vite собрать воркер вместе с его собственными
 *  импортами и вернуть адрес готового файла. Без этого карта молча остаётся пустой —
 *  тайлы разбирает воркер, и не стартовав, он их не запрашивает. */
setWorkerUrl(workerUrl)

/** Тайлы читает воркер, и протокол, объявленный выше в главном потоке, до него не
 *  доходит: оттуда уходит только запрос TileJSON, а дальше карта молча остаётся пустой,
 *  без единой ошибки. MapLibre v6 требует зарегистрировать протокол ещё и в воркере.
 *  `prewarm` здесь обязателен, а не оптимизация: до первой карты пула воркеров нет,
 *  и сообщение некому доставить.
 *  Промис не ждут — он и не разрешается; так же он вызывается и в примере самого
 *  MapLibre. Гонки нет: сообщение уходит воркеру раньше, чем карта успевает запросить
 *  первый тайл, — до этого ей нужно загрузить стиль и TileJSON. */
prewarm()
void importScriptInWorkers(pmtilesProtocolUrl)

interface MapPinProps {
  archiveUrl: string
  value: Point | null
  onChange: (point: Point) => void
}

/** Свой стиль вместо готовой темы, и без единой подписи. Подписи потребовали бы
 *  шрифтовых PBF, а их нет ни в бакете, ни в репозитории — только на хосте Protomaps.
 *  Тянуть чужой хост обратно, уходя с платного API ради независимости, значило бы
 *  поменять один внешний отказ на другой. Значков POI нет по той же причине и ещё
 *  потому, что они спорили бы с пином.
 *  Восемь слоёв снизу вверх; `places` и `pois` в тайлах есть и не отрисованы намеренно. */
function basemapStyle(archiveUrl: string): NonNullable<MapOptions['style']> {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'vector',
        url: `pmtiles://${archiveUrl}`,
        // ODbL требует указания источника рядом с картой; MapLibre покажет его сам.
        attribution:
          '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'outside', type: 'background', paint: { 'background-color': OUTSIDE } },
      {
        id: 'earth',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'earth',
        paint: { 'fill-color': EARTH },
      },
      {
        id: 'green',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'landuse',
        filter: ['match', ['get', 'kind'], GREEN_KINDS, true, false],
        paint: { 'fill-color': GREEN },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'water',
        paint: { 'fill-color': WATER },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'basemap',
        'source-layer': 'water',
        filter: ['match', ['get', 'kind'], WATERWAY_KINDS, true, false],
        paint: {
          'line-color': WATER,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 16, 3, 19, 8],
        },
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'buildings',
        minzoom: 14,
        paint: { 'fill-color': BUILDING },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'basemap',
        'source-layer': 'roads',
        filter: ['!=', ['get', 'kind'], 'rail'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ROAD,
          // Ширина по классу дороги. Зум допустим только внутри `interpolate`, поэтому
          // класс разбирается на каждой остановке, а не множителем снаружи.
          'line-width': [
            'interpolate',
            ['exponential', 1.5],
            ['zoom'],
            11,
            ['match', ['get', 'kind'], 'highway', 1.4, 'major_road', 1, 'medium_road', 0.7, 0.4],
            16,
            ['match', ['get', 'kind'], 'highway', 9, 'major_road', 7, 'medium_road', 5, 'minor_road', 3.5, 2],
            19,
            ['match', ['get', 'kind'], 'highway', 26, 'major_road', 20, 'medium_road', 14, 'minor_road', 10, 6],
          ],
        },
      },
      // Рамка города берётся из самих тайлов (`boundaries`, kind=county на z14–15):
      // за её пределами заявку отклонят, и край видеть полезно, но 260 КБ geojson
      // ради этого в бандл не кладутся — это четверть бюджета первой загрузки.
      {
        id: 'boundaries',
        type: 'line',
        source: 'basemap',
        'source-layer': 'boundaries',
        paint: {
          'line-color': BOUNDARY,
          'line-width': 1,
          'line-dasharray': [3, 2],
          'line-opacity': 0.7,
        },
      },
    ],
  }
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
