import type { ErrorCode } from '@ravonroad/shared-types'

/** Локаль по умолчанию и одновременно эталон ключей: ru типизируется по ней,
 *  поэтому забытый перевод ломает pnpm typecheck, а не показывает пустое место.
 *  Латиница использует ʻ (U+02BB) и ʼ (U+02BC) — как в глоссарии и в GeoJSON районов. */
export const uzUi = {
  'app.name': 'RavonRoad',
  'header.localeNavLabel': 'Sayt tili',
  'locale.uz': 'Oʻzbekcha',
  'locale.ru': 'Русский',
  'home.title': 'Toshkent yoʻllaridagi chuqurlar',
  'home.lead': 'Chuqur haqida xabar bering — brigada uni oʻzi taʼmirlaydi.',
  'home.repairedLabel': 'Taʼmirlangan chuqurlar',
  'home.goalLabel': 'Kampaniya maqsadi',
  'footer.contact': 'Kampaniya bilan bogʻlanish',
  'state.loading': 'Yuklanmoqda…',
  'state.errorTitle': 'Nimadir xato ketdi',
  'state.retry': 'Qayta urinish',
  'state.empty': 'Hozircha boʻsh',
} as const

export type UiKey = keyof typeof uzUi

/** Каждый код ошибки обязан иметь строку локали: тип Record<ErrorCode, string>
 *  не даст добавить код в контракт, не переведя его (ADR-0006, SRS §8.1). */
export const uzError: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'Yuborilgan maʼlumotlarda xato bor',
  NOT_FOUND: 'Soʻralgan sahifa topilmadi',
  INTERNAL_ERROR: 'Xizmatda kutilmagan xato',
}
