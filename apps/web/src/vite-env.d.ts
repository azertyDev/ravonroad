/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Куда житель пишет, чтобы удалить свои контакты или уточнить судьбу заявки
   *  (PRD §9.2.4). Значение задаёт владелец кампании при сборке. */
  readonly VITE_CAMPAIGN_CONTACT_URL?: string
}
