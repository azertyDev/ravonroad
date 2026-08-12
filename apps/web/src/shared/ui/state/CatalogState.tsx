import type { UseQueryResult } from '@tanstack/react-query'
import { apiErrorCode } from '../../api/client'
import { useI18n } from '../../i18n/useI18n'
import { ErrorState } from './ErrorState'
import { LoadingState } from './LoadingState'

/** Что стоит на месте справочника, пока его нет.
 *
 *  Списки районов и категорий рисуются как `(query.data ?? []).map(...)`, и на плохой
 *  сети это даёт пронумерованный шаг с пустотой под заголовком: ни загрузки, ни
 *  причины, ни кнопки. Житель читает такое как сломанную форму, а не как медленный
 *  запрос — и уходит.
 *
 *  Возвращает `null`, когда справочник приехал: тогда список рисует себя сам. */
export function CatalogState({ query }: { query: UseQueryResult<readonly unknown[]> }) {
  const { t } = useI18n()

  if (query.isPending) return <LoadingState />
  // Причина плюс одно действие — как требует дизайн-система от любой ошибки.
  if (query.isError) return <ErrorState code={apiErrorCode(query.error)} onRetry={() => void query.refetch()} />
  if (query.data.length === 0) return <p className="t-caption text-[var(--text-2)]">{t('state.empty')}</p>
  return null
}
