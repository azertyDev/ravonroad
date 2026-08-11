import type { ReportStatus } from '@ravonroad/shared-types'
import type { ReactNode } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { StatusMark } from './StatusMark'
import { STATUS_SLUG } from './statusShape'

interface StatusFieldProps {
  status: ReportStatus
  /** Правый край поля: дата перехода, срок ремонта. Две строки разрешены. */
  aside?: ReactNode
}

/** Статус заявки как плакатное поле во всю ширину — то же место в композиции, что
 *  у счётчика кампании на главной. Не плашка: именно по нему заявку узнают в переписке
 *  и на скриншоте (Report C).
 *
 *  Цвет поля один и тот же в обеих темах и объявлен вне тёмного блока палитры: если бы
 *  он адаптировался, узнавание по скриншоту пропало бы. Цвет текста на нём посчитан
 *  для каждой пары, а не назначен белым, — на бирюзовом DONE и оранжевом ACCEPTED
 *  белый не проходит AA, там стоит asphalt-950.
 *
 *  Имя токена собирается из слага, поэтому классов Tailwind тут нет: семь статусов
 *  дали бы четырнадцать статических пар ради двух свойств. */
export function StatusField({ status, aside }: StatusFieldProps) {
  const { t } = useI18n()
  const slug = STATUS_SLUG[status]

  return (
    <p
      className="flex items-center justify-between gap-[var(--s-3)] px-[var(--gutter)] py-[var(--s-4)]"
      style={{ background: `var(--status-${slug}-field)`, color: `var(--status-${slug}-on-field)` }}
    >
      <span className="t-h2 inline-flex items-center gap-[var(--s-3)] uppercase" style={{ letterSpacing: 'var(--t-h2-tracking)' }}>
        <StatusMark status={status} size={20} />
        {t(`status.${status}`)}
      </span>
      {aside !== undefined && <span className="t-chip shrink-0 text-right">{aside}</span>}
    </p>
  )
}
