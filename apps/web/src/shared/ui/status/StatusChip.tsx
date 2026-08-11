import type { ReportStatus } from '@ravonroad/shared-types'
import { useI18n } from '../../i18n/useI18n'
import { StatusMark } from './StatusMark'
import { INTERNAL_STATUSES, STATUS_SLUG } from './statusShape'

/** Плашка статуса: тон + форма + подпись. Форма внутри плашки та же, что внутри пина
 *  на карте, — связь «плашка ↔ пин» опознаётся без чтения подписи.
 *
 *  Цвета берутся тремя токенами одного статуса (`tint` фон, `ink` текст, `line` контур):
 *  контраст пары посчитан в палитре, а не назначен здесь. Имя токена собирается из слага,
 *  поэтому классов Tailwind тут нет — семь статусов дали бы двадцать одну статическую пару.
 *
 *  Внутренние статусы обведены пунктиром: дизайн-система метит их приёмом, а не только
 *  цветом, потому что на публичной карте их не существует.
 *
 *  Ширина — по контенту, перенос в две строки разрешён: узбекская подпись
 *  «Imkoniyatdan tashqari» на 360 px в одну строку не помещается. */
export function StatusChip({ status }: { status: ReportStatus }) {
  const { t } = useI18n()
  const slug = STATUS_SLUG[status]

  return (
    <span
      className={`t-chip inline-flex items-center gap-[var(--s-2)] rounded-[var(--r-2)] border px-[var(--s-3)] py-[var(--s-2)] ${
        INTERNAL_STATUSES.has(status) ? 'border-dashed' : 'border-solid'
      }`}
      style={{
        background: `var(--status-${slug}-tint)`,
        color: `var(--status-${slug}-ink)`,
        borderColor: `var(--status-${slug}-line)`,
      }}
    >
      <StatusMark status={status} size={12} />
      {t(`status.${status}`)}
    </span>
  )
}
