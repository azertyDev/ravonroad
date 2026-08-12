import type { ReportListItem } from '@ravonroad/shared-types'
import { Link } from '@tanstack/react-router'
import { formatDate } from '../../shared/format/date'
import type { Locale } from '../../shared/i18n/locale'
import { useI18n } from '../../shared/i18n/useI18n'
import { StatusChip } from '../../shared/ui/status/StatusChip'

/** Карточка заявки в списке: снимок, статус, место, дата и номер.
 *
 *  Статус стоит первым и плашкой — по нему список и просматривают. Ориентир набран
 *  обычным регистром и обрезается в одну строку: капслок на узбекском адресе
 *  не читается, а перенос на вторую строку разъехал бы ряд карточек по высоте.
 *
 *  Ссылка целиком, а не «подробнее» внутри: карточка — одна цель, и попасть в неё
 *  пальцем нужно любым местом. */
export function ReportCard({ item, locale }: { item: ReportListItem; locale: Locale }) {
  const { t } = useI18n()

  return (
    <Link
      to="/$locale/reports/$number"
      params={{ locale, number: String(item.number) }}
      className="grid grid-cols-[76px_1fr] items-center gap-[var(--s-3)] rounded-[var(--r-4)] border border-[var(--border-1)] bg-[var(--surface-card)] p-[var(--s-2)] hover:bg-[var(--surface-control-hover)]"
    >
      {item.previewUrl === null ? (
        // Фото ещё в очереди обработки: заявка принята целиком, превью появится через
        // секунды (SRS §4.2). Полосатая плита на его месте говорит, что там будет.
        <span className="h-[76px] rounded-[var(--r-3)] bg-[image:var(--hatch-placeholder)]" />
      ) : (
        <img
          src={item.previewUrl}
          alt={t('report.photoAlt')}
          loading="lazy"
          className="h-[76px] w-[76px] rounded-[var(--r-3)] object-cover"
        />
      )}
      <span className="flex min-w-0 flex-col items-start gap-[var(--s-2)]">
        <StatusChip status={item.status} />
        {item.landmark !== null && (
          <span className="t-h3 w-full truncate font-extrabold">{item.landmark}</span>
        )}
        <span className="t-caption tabular-nums text-[var(--text-2)]">
          {formatDate(item.createdAt)} · {item.displayNumber}
        </span>
      </span>
    </Link>
  )
}
