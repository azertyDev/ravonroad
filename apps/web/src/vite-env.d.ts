/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Куда житель пишет, чтобы удалить свои контакты или уточнить судьбу заявки
   *  (PRD §9.2.4). Значение задаёт владелец кампании при сборке. */
  readonly VITE_CAMPAIGN_CONTACT_URL?: string
  /** Стиль MapLibre, ссылающийся на PMTiles-экстракт Ташкента в нашем бакете.
   *  Пусто — карта не показывается вовсе, и точка выбирается кнопкой «моё
   *  местоположение» и полями широты и долготы (PRD §8.2). */
  readonly VITE_MAP_STYLE_URL?: string
}
