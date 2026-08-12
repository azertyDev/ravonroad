import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { catalogKeys, fetchDistricts, localizedName } from '../../entities/catalog/api'
import { fetchReportDetail, reportKeys } from '../../entities/report/api'
import { apiErrorCode } from '../../shared/api/client'
import { useI18n } from '../../shared/i18n/useI18n'
import { Glyph } from '../../shared/ui/icon/Glyph'
import { ErrorState } from '../../shared/ui/state/ErrorState'
import { LoadingState } from '../../shared/ui/state/LoadingState'
import { StatusMark } from '../../shared/ui/status/StatusMark'

/** Статус заявки меняется редко, а карточку по дороге к списку открывают часто
 *  (SRS §7.5). */
const DETAIL_STALE_TIME = 60_000

interface ReportPopupProps {
  number: number
  onClose: () => void
}

/** Карточка, всплывающая по тапу на маркер: первое фото, статус, район и ссылка
 *  на полную карточку (US-001).
 *
 *  Запрос тот же и с тем же ключом, что и у страницы заявки, поэтому переход по ссылке
 *  открывается мгновенно — данные уже в кэше.
 *
 *  Не `dialog`: она не перекрывает карту и не забирает фокус — житель тапает маркеры
 *  подряд, и ловушка фокуса на каждом тапе была бы наказанием, а не доступностью. */
export function ReportPopup({ number, onClose }: ReportPopupProps) {
  const { locale, t } = useI18n()
  const detail = useQuery({
    queryKey: reportKeys.detail(number),
    queryFn: () => fetchReportDetail(number),
    staleTime: DETAIL_STALE_TIME,
  })
  const districts = useQuery({
    queryKey: catalogKeys.districts,
    queryFn: fetchDistricts,
    staleTime: Infinity,
  })

  const report = detail.data
  const district = districts.data?.find((item) => item.code === report?.districtCode)
  const preview = report?.photos.find((photo) => photo.kind === 'BEFORE')

  return (
    <aside
      aria-label={`${t('map.marker.label')} ${number}`}
      className="absolute inset-x-[var(--s-3)] bottom-[var(--s-3)] flex gap-[var(--s-3)] rounded-[var(--r-3)] border border-[var(--border-1)] bg-[var(--surface-card)] p-[var(--s-3)] shadow-[var(--e-2)]"
    >
      {detail.isPending && <LoadingState />}
      {detail.isError && <ErrorState code={apiErrorCode(detail.error)} onRetry={() => void detail.refetch()} />}

      {report !== undefined && (
        <>
          {preview === undefined ? (
            // Фото ещё в очереди обработки: заявка принята целиком, превью появится
            // через секунды (SRS §4.2). Пустое место на его месте читалось бы как
            // «фото нет вовсе».
            <p className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-[var(--r-2)] bg-[var(--surface-sunken)] px-[var(--s-1)] text-center text-[length:10px] leading-tight text-[var(--text-2)]">
              {t('report.photosPending')}
            </p>
          ) : (
            <img
              src={preview.previewUrl}
              alt={t('report.photoAlt')}
              className="h-[72px] w-[72px] shrink-0 rounded-[var(--r-2)] object-cover"
            />
          )}

          <div className="flex min-w-0 flex-col gap-[var(--s-1)]">
            <p className="t-label inline-flex items-center gap-[var(--s-2)]">
              <StatusMark status={report.status} />
              {t(`status.${report.status}`)}
            </p>
            {district !== undefined && (
              <p className="t-caption text-[var(--text-2)]">{localizedName(district, locale)}</p>
            )}
            <Link
              to="/$locale/reports/$number"
              params={{ locale, number: String(report.number) }}
              className="t-label inline-flex min-h-[var(--touch-min)] items-center"
            >
              {report.displayNumber}
            </Link>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label={t('map.close')}
        className="ml-auto grid h-[var(--touch-min)] w-[var(--touch-min)] shrink-0 place-items-center rounded-[var(--r-2)] text-[var(--text-2)]"
      >
        <Glyph name="close" />
      </button>
    </aside>
  )
}
