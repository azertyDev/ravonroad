import type { CategoryDto, DistrictDto, Locale } from '@ravonroad/shared-types'
import { apiFetch } from '../../shared/api/client'

/** Справочники меняются раз в несколько месяцев и кэшируются сервером на сутки,
 *  поэтому в клиенте они `staleTime: Infinity` — перезапрашивать нечего (SRS §7.5). */
export const catalogKeys = {
  categories: ['categories'] as const,
  districts: ['districts'] as const,
}

export function fetchCategories(): Promise<CategoryDto[]> {
  return apiFetch<CategoryDto[]>('/categories')
}

/** 12 районов с прямоугольниками: ими подгоняется карта под выбранный район (US-031)
 *  и проверяется, стоит ли житель в городе вообще (US-002). Полигонов в ответе нет —
 *  это 268 КБ при бюджете страницы в 700 КБ. */
export function fetchDistricts(): Promise<DistrictDto[]> {
  return apiFetch<DistrictDto[]>('/districts')
}

/** Названия районов и категорий живут в БД, а не в словаре локали: категория добавляется
 *  `INSERT`ом, без миграции и передеплоя (SRS §2.5). Выбор колонки поэтому здесь. */
export function localizedName(item: { nameUz: string; nameRu: string }, locale: Locale): string {
  return locale === 'ru' ? item.nameRu : item.nameUz
}
