import type { CategoryDto } from '@ravonroad/shared-types'
import { apiFetch } from '../../shared/api/client'

/** Справочники меняются раз в несколько месяцев и кэшируются сервером на сутки,
 *  поэтому в клиенте они `staleTime: Infinity` — перезапрашивать нечего (SRS §7.5). */
export const catalogKeys = {
  categories: ['categories'] as const,
}

export function fetchCategories(): Promise<CategoryDto[]> {
  return apiFetch<CategoryDto[]>('/categories')
}
