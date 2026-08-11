import type { ReportDetail } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import { catalogKeys, fetchCategories, fetchDistricts, localizedName } from '../catalog/api'
import { formatDate, formatDateTime } from '../../shared/format/date'
import { useI18n } from '../../shared/i18n/useI18n'
import { StatusChip } from '../../shared/ui/status/StatusChip'
import { StatusMark } from '../../shared/ui/status/StatusMark'

/** Тело карточки заявки: фото, поля, история.
 *
 *  Один компонент на публичную страницу и на страницу отслеживания. Разница между ними —
 *  причина отказа и кнопка удаления контактов (SRS §4.5), а всё остальное обязано
 *  совпадать: житель на своей странице должен видеть ровно то, что показано всем. */
export function ReportSummary({ report }: { report: ReportDetail }) {
  const { locale, t } = useI18n()
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: Infinity })

  const district = districts.data?.find((item) => item.code === report.districtCode)
  const category = categories.data?.find((item) => item.code === report.categoryCode)
  const before = report.photos.filter((photo) => photo.kind === 'BEFORE')
  const after = report.photos.filter((photo) => photo.kind === 'AFTER')

  return (
    <>
      <p>
        <StatusChip status={report.status} />
      </p>

      <section className="flex flex-col gap-[var(--s-3)]">
        <h2 className="t-h3">{t('report.photosBefore')}</h2>
        {before.length === 0 ? (
          <p className="t-caption text-[var(--text-2)]">{t('report.photosPending')}</p>
        ) : (
          <PhotoList photos={before} alt={t('report.photoAlt')} />
        )}
      </section>

      {after.length > 0 && (
        <section className="flex flex-col gap-[var(--s-3)]">
          <h2 className="t-h3">{t('report.photosAfter')}</h2>
          <PhotoList photos={after} alt={t('report.photoAfterAlt')} />
        </section>
      )}

      {report.publicationUrl !== null && (
        // Новая вкладка: житель пришёл смотреть заявку, а не уходить в соцсеть.
        <a
          href={report.publicationUrl}
          target="_blank"
          rel="noreferrer"
          className="t-label inline-flex min-h-[var(--touch-base)] items-center self-start rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
        >
          {t('report.publication')}
        </a>
      )}

      {/* Подпись перед значением: иначе <dl> не связывает пару, и скринридер читает
          значение без имени поля. */}
      <dl className="flex flex-col gap-[var(--s-3)]">
        {district !== undefined && <Field label={t('report.district')} value={localizedName(district, locale)} />}
        {category !== undefined && <Field label={t('report.category')} value={localizedName(category, locale)} />}
        {report.landmark !== null && <Field label={t('report.landmark')} value={report.landmark} />}
        <Field label={t('report.created')} value={formatDate(report.createdAt)} />
        {report.doneAt !== null && <Field label={t('report.doneAt')} value={formatDate(report.doneAt)} />}
      </dl>

      <section className="flex flex-col gap-[var(--s-3)]">
        <h2 className="t-h3">{t('report.history')}</h2>
        <ol className="flex flex-col gap-[var(--s-2)]">
          {report.history.map((entry) => (
            <li key={`${entry.at}-${entry.status}`} className="flex flex-wrap items-center gap-[var(--s-2)]">
              <StatusMark status={entry.status} />
              <span className="t-label">{t(`status.${entry.status}`)}</span>
              <span className="t-caption tabular-nums text-[var(--text-2)]">{formatDateTime(entry.at)}</span>
              {/* Отменённый переход остаётся в истории: она не переписывается задним
                  числом (PRD 5.3.4). */}
              {entry.undone && <span className="t-caption text-[var(--text-2)]">{t('report.undone')}</span>}
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[var(--s-1)]">
      <dt className="t-caption text-[var(--text-2)]">{label}</dt>
      <dd className="t-body-l tabular-nums">{value}</dd>
    </div>
  )
}

function PhotoList({ photos, alt }: { photos: ReportDetail['photos']; alt: string }) {
  return (
    <ul className="flex flex-wrap gap-[var(--s-3)]">
      {photos.map((photo) => (
        <li key={photo.url}>
          <a href={photo.url} target="_blank" rel="noreferrer">
            <img src={photo.previewUrl} alt={alt} className="h-[160px] w-[160px] rounded-[var(--r-2)] object-cover" />
          </a>
        </li>
      ))}
    </ul>
  )
}
