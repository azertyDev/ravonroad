import type { ReportDetail, ReportStatus } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { catalogKeys, fetchCategories, fetchDistricts, localizedName } from '../catalog/api'
import { useCampaignStats } from '../../features/stats/useCampaignStats'
import { formatDate, formatDateTime } from '../../shared/format/date'
import { formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'
import type { UiKey } from '../../shared/i18n/messages'
import { PhotoPending, PhotoPlate } from '../../shared/ui/media/PhotoPlate'
import { StatusField } from '../../shared/ui/status/StatusField'
import { StatusMark } from '../../shared/ui/status/StatusMark'
import { STATUS_SLUG } from '../../shared/ui/status/statusShape'

/** Пояснение к статусу написано только там, где его написал дизайнер. Остальные
 *  статусы обходятся без него: обещания бригады — продуктовый текст, и выдумывать
 *  их на публичном сайте нельзя. */
const STATUS_NOTE: Partial<Record<ReportStatus, UiKey>> = {
  NEW: 'report.note.NEW',
  IN_PROGRESS: 'report.note.IN_PROGRESS',
}

interface ReportSummaryProps {
  report: ReportDetail
  /** Блок между шапкой и фотографиями: причина отказа и ссылка на оригинал дубля
   *  на странице отслеживания. Место выбрано так, чтобы причину прочли раньше,
   *  чем историю статусов, — за ней человек и пришёл. */
  note?: ReactNode
}

/** Тело карточки заявки: статусное поле, место, фотографии, история.
 *
 *  Один компонент на публичную страницу и на страницу отслеживания. Разница между ними —
 *  причина отказа и кнопка удаления контактов (SRS §4.5), а всё остальное обязано
 *  совпадать: житель на своей странице должен видеть ровно то, что показано всем.
 *
 *  Статус занимает поле во всю ширину — та же композиция, что у счётчика на главной.
 *  Фотографии тоже идут в край, без карточки и без рамки. */
export function ReportSummary({ report, note }: ReportSummaryProps) {
  const { locale, t } = useI18n()
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: Infinity })
  const stats = useCampaignStats()

  const district = districts.data?.find((item) => item.code === report.districtCode)
  const districtName = district === undefined ? null : localizedName(district, locale)
  const category = categories.data?.find((item) => item.code === report.categoryCode)
  const before = report.photos.filter((photo) => photo.kind === 'BEFORE')
  const after = report.photos.filter((photo) => photo.kind === 'AFTER')
  const noteKey = STATUS_NOTE[report.status]

  return (
    <>
      <StatusField status={report.status} aside={formatDate(report.doneAt ?? report.createdAt)} />

      <div className="flex flex-col gap-[var(--s-3)] px-[var(--gutter)] py-[var(--s-5)]">
        {/* Ориентир — заголовок страницы: это единственное, чем яма отличается от
            соседней в глазах человека. Обычным регистром: капслок на длинной
            узбекской строке не читается.

            Ориентир необязателен, и без него заголовком становится район. Тогда
            он и остаётся единственным: строка с названием района под заголовком
            «Юнусабадский район» повторяла бы его слово в слово. */}
        <h1 className="t-h1">{report.landmark ?? districtName ?? report.displayNumber}</h1>
        {report.landmark !== null && districtName !== null && (
          <p className="t-body text-[var(--text-2)]">{districtName}</p>
        )}
        <div className="flex flex-wrap gap-[var(--s-2)] empty:hidden">
          {category !== undefined && <Tag>{localizedName(category, locale)}</Tag>}
          {/* «0 surat» не пишется: отсутствие снимков видно по самим плитам ниже,
              а плашка с нулём читается как поле, которое забыли заполнить. */}
          {report.photos.length > 0 && (
            <Tag>
              <span className="tabular-nums">{formatNumber(report.photos.length)}</span>
              &nbsp;
              {t('report.photoCount')}
            </Tag>
          )}
        </div>
      </div>

      {note}

      {/* Пара «до / после» идёт в край и в две колонки. Место снимка «после» названо
          словами, пока его нет: пустая клетка читается как поломка страницы. */}
      <div className="grid grid-cols-2 gap-[2px] bg-[var(--border-1)]">
        {before.map((photo) => (
          <PhotoPlate
            key={photo.url}
            src={photo.previewUrl}
            href={photo.url}
            alt={t('report.photoAlt')}
            caption={t('report.before')}
          />
        ))}
        {after.map((photo) => (
          <PhotoPlate
            key={photo.url}
            src={photo.previewUrl}
            href={photo.url}
            alt={t('report.photoAfterAlt')}
            caption={t('report.after')}
            tone="done"
          />
        ))}
        {before.length === 0 && <PhotoPending caption={t('report.photosPending')} />}
        {after.length === 0 && <PhotoPending caption={t('report.photoAfterPending')} />}
      </div>

      <div className="flex flex-col gap-[var(--block-gap)] px-[var(--gutter)] py-[var(--s-5)]">
        {noteKey !== undefined && (
          <p className="flex gap-[var(--s-3)] rounded-[var(--r-4)] bg-[var(--surface-sunken)] p-[var(--s-4)]">
            <span className="mt-[3px]" style={{ color: `var(--status-${STATUS_SLUG[report.status]}-ink)` }}>
              <StatusMark status={report.status} size={14} />
            </span>
            <span className="t-caption text-[var(--text-1)]">{t(noteKey)}</span>
          </p>
        )}

        {report.publicationUrl !== null && (
          // Новая вкладка: житель пришёл смотреть заявку, а не уходить в соцсеть.
          <a
            href={report.publicationUrl}
            target="_blank"
            rel="noreferrer"
            className="t-action self-start underline decoration-[var(--accent)] decoration-2 underline-offset-4"
          >
            {t('report.publication')}
          </a>
        )}

        <section className="flex flex-col gap-[var(--s-4)]">
          <h2 className="t-section text-[var(--text-2)]">{t('report.history')}</h2>
          {/* Лента истории: точка текущего статуса окрашена его цветом и крупнее,
              прошедшие — нейтральные. Линия между ними рисуется псевдоэлементом
              последнего столбца, а не отдельной ячейкой: последней записи она не нужна. */}
          <ol className="flex flex-col">
            {report.history.map((entry, index) => (
              <li key={`${entry.at}-${entry.status}`} className="grid grid-cols-[24px_1fr] gap-[var(--s-3)]">
                <span className="flex flex-col items-center gap-[2px]">
                  <span
                    className="mt-[3px] shrink-0 rounded-[var(--r-pill)]"
                    style={
                      index === 0
                        ? {
                            width: '14px',
                            height: '14px',
                            background: `var(--status-${STATUS_SLUG[entry.status]}-pin)`,
                            boxShadow: `0 0 0 3px var(--status-${STATUS_SLUG[entry.status]}-tint)`,
                          }
                        : { width: '10px', height: '10px', background: 'var(--border-2)' }
                    }
                  />
                  {index < report.history.length - 1 && <span className="w-[2px] flex-1 bg-[var(--border-1)]" />}
                </span>
                <span className={index < report.history.length - 1 ? 'pb-[var(--s-4)]' : ''}>
                  <span className={`t-action block ${index === 0 ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]'}`}>
                    {t(`status.${entry.status}`)}
                  </span>
                  <span className="t-caption mt-[var(--s-1)] block tabular-nums text-[var(--text-2)]">
                    {formatDateTime(entry.at)}
                    {/* Заявки приходят только с сайта: другого входа в систему нет. */}
                    {index === report.history.length - 1 && ` · ${t('report.source')}`}
                  </span>
                  {/* Отменённый переход остаётся в истории: она не переписывается задним
                      числом (PRD 5.3.4). */}
                  {entry.undone && (
                    <span className="t-caption block text-[var(--text-2)]">{t('report.undone')}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Закрытая заявка заканчивается связью с кампанией: тем же жёлтым полем и тем же
          числом, что на главной. Пока число не приехало, полосы нет вовсе — плашка
          «одна из 10 000» без числа обещает то, чего не показывает. */}
      {report.status === 'DONE' && stats.data !== undefined && (
        <p className="flex items-center justify-between gap-[var(--s-3)] bg-[var(--accent)] px-[var(--gutter)] py-[var(--s-4)] text-[var(--text-on-accent)]">
          <span className="t-h3 max-w-[20ch] font-extrabold uppercase">{t('report.campaignLine')}</span>
          <span className="t-h1 tabular-nums">{formatNumber(stats.data.done)}</span>
        </p>
      )}
    </>
  )
}

/** Признак заявки: тип нуждения, число снимков. Плашка без статуса — она не сообщает
 *  состояние, поэтому и цвета статуса не берёт. */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="t-chip inline-flex items-center rounded-[var(--r-2)] border border-[var(--border-1)] bg-[var(--surface-sunken)] px-[var(--s-2)] py-[var(--s-2)] text-[var(--text-2)]">
      {children}
    </span>
  )
}

