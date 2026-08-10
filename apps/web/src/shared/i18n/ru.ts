import type { ErrorCode } from '@ravonroad/shared-types'
import type { UiKey } from './uz'

export const ruUi: Record<UiKey, string> = {
  'app.name': 'RavonRoad',
  'header.localeNavLabel': 'Язык сайта',
  'locale.uz': 'Oʻzbekcha',
  'locale.ru': 'Русский',
  'home.title': 'Ямы на дорогах Ташкента',
  'home.lead': 'Сообщите о яме — бригада отремонтирует её сама.',
  'home.repairedLabel': 'Отремонтировано ям',
  'home.goalLabel': 'Цель кампании',
  'footer.contact': 'Связаться с кампанией',
  'state.loading': 'Загрузка…',
  'state.errorTitle': 'Что-то пошло не так',
  'state.retry': 'Повторить',
  'state.empty': 'Пока пусто',
}

export const ruError: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'В отправленных данных есть ошибка',
  NOT_FOUND: 'Запрошенная страница не найдена',
  INTERNAL_ERROR: 'Непредвиденная ошибка сервиса',
  OUTSIDE_TASHKENT: 'Кампания работает только в Ташкенте',
  PHOTOS_REQUIRED: 'Нужна хотя бы одна фотография',
  IDEMPOTENCY_CONFLICT: 'Эта отправка уже принята с другими данными',
  PAYLOAD_TOO_LARGE: 'Файл слишком большой',
  UNSUPPORTED_MEDIA_TYPE: 'Этот формат файла не поддерживается',
  RATE_LIMITED: 'Слишком много попыток, подождите немного',
  STORAGE_UNAVAILABLE: 'Хранилище фотографий временно недоступно, повторите',
}
