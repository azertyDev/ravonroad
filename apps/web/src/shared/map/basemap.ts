import 'maplibre-gl/dist/maplibre-gl.css'
import { addProtocol, type MapOptions } from 'maplibre-gl'
import { Protocol } from 'pmtiles'

/** Экстракт вырезан по границе Ташкента: дальше отъезжать некуда, там пусто. */
export const MIN_ZOOM = 10
/** Тайлы кончаются на 15-м, дальше MapLibre растягивает их сам — и это ещё читаемо. */
export const MAX_ZOOM = 19

/** Подложка обязана молчать: единственные яркие пятна на ней — пины заявок. Цвета сняты
 *  со шкалы asphalt (shared/styles/tokens/colors.css), числами, а не переменными:
 *  стиль MapLibre — это JSON, до CSS он не дотягивается. Тема здесь одна, светлая:
 *  тёмная подложка потребовала бы второго набора и переключения по prefers-color-scheme,
 *  а карта тут — фон под пины, а не предмет разглядывания. */
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
 *  один раз на страницу — модуль общий для обеих карт, и второй регистрации не будет,
 *  сколько бы карт ни открыл житель. Сам модуль грузится лениво: на маршрутах без карты
 *  не выполняется. */
addProtocol('pmtiles', new Protocol().tile)

/** Свой стиль вместо готовой темы, и без единой подписи. Подписи потребовали бы
 *  шрифтовых PBF, а их нет ни в бакете, ни в репозитории — только на хосте Protomaps.
 *  Тянуть чужой хост обратно, уходя с платного API ради независимости, значило бы
 *  поменять один внешний отказ на другой. Значков POI нет по той же причине и ещё
 *  потому, что они спорили бы с пинами.
 *  Восемь слоёв снизу вверх; `places` и `pois` в тайлах есть и не отрисованы намеренно. */
export function basemapStyle(archiveUrl: string): NonNullable<MapOptions['style']> {
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
