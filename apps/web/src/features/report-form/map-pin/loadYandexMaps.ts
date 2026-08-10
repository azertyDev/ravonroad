/** Загрузчик Яндекс JS API v3 (ADR-0004, SRS §7.4).
 *
 *  У Яндекса берутся **только** виджет выбора точки и тайлы. Геокодер не вызывается
 *  ни при каких условиях: его результаты нельзя хранить дольше ~30 дней, а заявки живут
 *  всю кампанию, и одно поле с адресом сделало бы нелегальным весь фотоархив.
 *  Появление обращения к `geocode` или `suggest` — нарушение ADR и повод остановить ревью.
 *
 *  Скрипт подключается по требованию и один раз на страницу: на маршрутах без карты
 *  ни байта Яндекса не грузится, а второй вызов переиспользует первый промис. */

export type Coordinates = [longitude: number, latitude: number]

interface YMapEntity {
  readonly __brand?: 'ymap-entity'
}

interface YMapMarkerInstance extends YMapEntity {
  update: (props: { coordinates: Coordinates }) => void
}

interface YMapInstance {
  addChild: (child: YMapEntity) => void
  setLocation: (location: { center: Coordinates; duration?: number }) => void
  destroy: () => void
}

interface DragEndHandler {
  (coordinates: Coordinates): void
}

/** Ровно та часть API, которой пользуется виджет. Объявлена руками, потому что пакета
 *  типов у v3 нет, а `any` в проекте запрещён: узкий интерфейс ловит опечатку в имени
 *  конструктора на этапе сборки, широкий — нет. */
export interface YMaps3 {
  ready: Promise<void>
  YMap: new (root: HTMLElement, props: { location: { center: Coordinates; zoom: number } }) => YMapInstance
  YMapDefaultSchemeLayer: new (props: Record<string, never>) => YMapEntity
  YMapDefaultFeaturesLayer: new (props: Record<string, never>) => YMapEntity
  YMapMarker: new (
    props: { coordinates: Coordinates; draggable: boolean; onDragEnd: DragEndHandler },
    element: HTMLElement,
  ) => YMapMarkerInstance
  YMapListener: new (props: {
    layer: string
    onFastClick: (object: unknown, event: { coordinates: Coordinates }) => void
  }) => YMapEntity
}

declare global {
  interface Window {
    ymaps3?: YMaps3
  }
}

export type { YMapEntity, YMapInstance, YMapMarkerInstance }

let pending: Promise<YMaps3> | null = null

export function loadYandexMaps(apiKey: string, lang: string): Promise<YMaps3> {
  if (pending !== null) return pending

  pending = new Promise<YMaps3>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(apiKey)}&lang=${lang}`
    script.async = true
    script.addEventListener('load', () => {
      const namespace = window.ymaps3
      if (namespace === undefined) {
        reject(new Error('yandex maps loaded without a ymaps3 namespace'))
        return
      }
      namespace.ready.then(() => resolve(namespace), reject)
    })
    // Сеть у бордюра нестабильна, и Яндекс может быть недоступен целиком. Отказ здесь
    // не должен ронять форму: выбор точки остаётся возможен полями широты и долготы.
    script.addEventListener('error', () => {
      pending = null
      reject(new Error('yandex maps failed to load'))
    })
    document.head.append(script)
  })

  return pending
}
