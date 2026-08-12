import type { ReportDetail, ReportStatus } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { lazy, Suspense, type ReactNode } from 'react'
import { catalogKeys, fetchCategories, fetchDistricts, localizedName } from '../catalog/api'
import { campaignScale } from '../../features/stats/scale'
import { useCampaignStats } from '../../features/stats/useCampaignStats'
import { formatDate, formatDateTime } from '../../shared/format/date'
import { formatDistance, formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'
import type { UiKey } from '../../shared/i18n/messages'
import { useDesktop } from '../../shared/lib/useDesktop'
import { SECONDARY } from '../../shared/ui/control/styles'
import { openLightbox, type LightboxPhoto } from '../../shared/ui/media/lightbox'
import { PhotoPending, PhotoPlate } from '../../shared/ui/media/PhotoPlate'
import { StatusField } from '../../shared/ui/status/StatusField'
import { StatusMark } from '../../shared/ui/status/StatusMark'
import { STATUS_SLUG } from '../../shared/ui/status/statusShape'

/** Мини-карта грузит MapLibre и стиль подложки, поэтому она приходит отдельным куском
 *  и только там, где её решили показать. */
const MiniMap = lazy(() => import('../../features/report-map/MiniMap'))

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
 *  На телефоне это одна колонка, где статус занимает поле во всю ширину, а фотографии
 *  идут в край — та же композиция, что у счётчика на главной. На ноутбуке заявка
 *  становится карточкой с цветной полосой статуса, а рядом встаёт колонка «где это»:
 *  мини-карта, полоса кампании и соседние ямы (Desktop C › экран 3). */
export function ReportSummary({ report, note }: ReportSummaryProps) {
  const { locale, t } = useI18n()
  const desktop = useDesktop()
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const categories = useQuery({ queryKey: catalogKeys.categories, queryFn: fetchCategories, staleTime: Infinity })
  const stats = useCampaignStats()
  const archiveUrl = import.meta.env.VITE_MAP_PMTILES_URL

  const district = districts.data?.find((item) => item.code === report.districtCode)
  const districtName = district === undefined ? null : localizedName(district, locale)
  const nameOfDistrict = (code: string): string => {
    const found = districts.data?.find((item) => item.code === code)
    return found === undefined ? code : localizedName(found, locale)
  }
  const category = categories.data?.find((item) => item.code === report.categoryCode)
  const before = report.photos.filter((photo) => photo.kind === 'BEFORE')
  const after = report.photos.filter((photo) => photo.kind === 'AFTER')
  const noteKey = STATUS_NOTE[report.status]
  // Один список на все плиты: просмотрщик листает «до» и «после» подряд, как они стоят
  // на странице, а не открывает каждый снимок отдельной галереей из одного кадра.
  const gallery: LightboxPhoto[] = [...before, ...after].map((photo) => ({
    src: photo.url,
    thumb: photo.previewUrl,
    width: photo.width,
    height: photo.height,
    alt: photo.kind === 'AFTER' ? t('report.photoAfterAlt') : t('report.photoAlt'),
    caption: photo.kind === 'AFTER' ? t('report.after') : t('report.before'),
  }))
  const hasMap = desktop && archiveUrl !== undefined && archiveUrl !== ''

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-[var(--s-6)] lg:p-[var(--s-6)]">
      {/* Заявка. На ноутбуке — карточка с цветной кромкой статуса сверху; на телефоне
          та же последовательность блоков без рамки, в край экрана. */}
      <div className="lg:overflow-hidden lg:rounded-[var(--r-4)] lg:border lg:border-[var(--border-1)]">
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

        {/* Пара «до / после» идёт в край. На телефоне это две колонки, на ноутбуке —
            одна строка на все снимки: при двух рядах по 4/3 карточка переставала
            помещаться в экран, и заявка из трёх абзацев требовала прокрутки.
            Место снимка «после» названо словами, пока его нет: пустая клетка читается
            как поломка страницы. */}
        <div className="grid grid-cols-2 gap-[2px] bg-[var(--border-1)] lg:auto-cols-fr lg:grid-flow-col">
          {before.map((photo, index) => (
            <PhotoPlate
              key={photo.url}
              src={photo.previewUrl}
              onOpen={() => void openLightbox(gallery, index)}
              alt={t('report.photoAlt')}
              caption={t('report.before')}
            />
          ))}
          {after.map((photo, index) => (
            <PhotoPlate
              key={photo.url}
              src={photo.previewUrl}
              onOpen={() => void openLightbox(gallery, before.length + index)}
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
            {/* Лента истории. На телефоне — вертикальная: точка текущего статуса
                окрашена его цветом и крупнее, прошедшие нейтральные, между ними линия.
                На ноутбуке та же история ложится полосой плит и читается одним взглядом
                (Desktop C); точки и линия там не нужны — порядок задаёт сама полоса. */}
            <ol className="flex flex-col lg:grid lg:grid-cols-[repeat(auto-fit,minmax(120px,1fr))] lg:gap-[2px]">
              {report.history.map((entry, index) => (
                <li
                  key={`${entry.at}-${entry.status}`}
                  className="grid grid-cols-[24px_1fr] gap-[var(--s-3)] lg:block lg:gap-0 lg:bg-[var(--surface-sunken)] lg:p-[var(--s-4)]"
                  style={
                    desktop
                      ? {
                          borderTop: `3px solid ${
                            index === 0 ? `var(--status-${STATUS_SLUG[entry.status]}-pin)` : 'var(--border-2)'
                          }`,
                        }
                      : undefined
                  }
                >
                  <span className="flex flex-col items-center gap-[2px] lg:hidden">
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
                  <span className={index < report.history.length - 1 ? 'pb-[var(--s-4)] lg:pb-0' : ''}>
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
      </div>

      {/* «Где это»: карта места, полоса кампании и соседние ямы. На телефоне колонка
          просто продолжает страницу. */}
      <aside className="flex flex-col gap-[var(--s-4)] max-lg:mt-[var(--s-5)]">
        {hasMap && (
          <div className="overflow-hidden max-lg:hidden lg:rounded-[var(--r-4)] lg:border lg:border-[var(--border-1)]">
            <div className="relative h-[220px]">
              <Suspense fallback={null}>
                <MiniMap
                  archiveUrl={archiveUrl}
                  latitude={report.latitude}
                  longitude={report.longitude}
                  mapLabel={t('map.canvasLabel')}
                />
              </Suspense>
              {/* Пин стоит разметкой, а не маркером: карта отцентрована на заявке и
                  сдвинуться не может, поэтому середина контейнера и есть точка. */}
              <span className="pointer-events-none absolute top-1/2 left-1/2 grid h-[36px] w-[36px] -translate-x-1/2 -translate-y-full place-items-center text-[var(--pin-stroke)]">
                <span
                  className="grid h-full w-full place-items-center"
                  style={{
                    background: `var(--status-${STATUS_SLUG[report.status]}-pin)`,
                    borderRadius: 'var(--pin-radius)',
                    border: 'var(--pin-border-selected)',
                    boxShadow: 'var(--e-pin-selected)',
                    transform: 'rotate(-45deg)',
                  }}
                >
                  <span className="grid place-items-center" style={{ transform: 'rotate(45deg)' }}>
                    <StatusMark status={report.status} size={16} />
                  </span>
                </span>
              </span>
            </div>
          </div>
        )}

        {/* «Показать на карте» ведёт на карту города, наведённую на эту яму: прицел
            уходит в адрес, поэтому ссылкой можно поделиться так же, как самой заявкой. */}
        <div className="px-[var(--gutter)] lg:px-0">
          <Link
            to="/$locale"
            params={{ locale }}
            search={{ lat: report.latitude, lon: report.longitude }}
            className={SECONDARY}
          >
            {t('report.showOnMap')}
          </Link>
        </div>

        {/* Полоса кампании: то же число и та же шкала, что на главной. Пока число
            не приехало, полосы нет вовсе — «одна из 10 000» без числа обещает то,
            чего не показывает. */}
        {report.status === 'DONE' && stats.data !== undefined && (
          <section className="bg-[var(--accent)] px-[var(--gutter)] py-[var(--s-4)] text-[var(--text-on-accent)] lg:rounded-[var(--r-4)] lg:px-[var(--s-5)] lg:py-[var(--s-5)]">
            <h2 className="t-label">{t('report.campaign')}</h2>
            <p className="t-h1 mt-[var(--s-2)] tabular-nums">
              {formatNumber(stats.data.done)} / {formatNumber(stats.data.goal)}
            </p>
            <div className="relative mt-[var(--s-3)] h-[12px] overflow-hidden rounded-[var(--r-1)] bg-[var(--asphalt-950)]">
              <div
                className="absolute inset-y-0 left-0 bg-[var(--asphalt-0)]"
                style={{ right: campaignScale(stats.data.done, stats.data.goal).right }}
              />
            </div>
            <p className="t-chip mt-[var(--s-3)] font-extrabold">{t('report.campaignLine')}</p>
          </section>
        )}

        {/* «Рядом»: соседние заявки в трёх километрах. На странице отслеживания массив
            пуст — там показывают одну заявку по личной ссылке, а не окрестности, —
            и блока тогда нет вовсе.

            Адреса у соседа нет и не будет: геокодер запрещён лицензией (ADR-0004).
            Вместо него — район и расстояние, а место человек узнаёт, открыв заявку. */}
        {report.nearby.length > 0 && (
          <section className="flex flex-col gap-[var(--s-3)] px-[var(--gutter)] pb-[var(--s-5)] lg:rounded-[var(--r-4)] lg:border lg:border-[var(--border-1)] lg:p-[var(--s-5)]">
            <h2 className="t-section text-[var(--text-2)]">{t('report.nearby')}</h2>
            <ul className="flex flex-col gap-[var(--s-2)]">
              {report.nearby.map((item) => (
                <li key={item.number}>
                  <Link
                    to="/$locale/reports/$number"
                    params={{ locale, number: String(item.number) }}
                    className="flex items-center gap-[var(--s-3)] rounded-[var(--r-3)] border border-[var(--border-1)] bg-[var(--surface-card)] p-[var(--s-3)] hover:bg-[var(--surface-control-hover)] lg:border-0 lg:bg-transparent lg:p-[var(--s-1)]"
                  >
                    <span style={{ color: `var(--status-${STATUS_SLUG[item.status]}-ink)` }}>
                      <StatusMark status={item.status} size={14} />
                    </span>
                    <span className="t-caption min-w-0 flex-1 truncate text-[var(--text-2)]">
                      {nameOfDistrict(item.districtCode)}
                    </span>
                    {/* Не t-chip: капслок превращает «410 m» в «410 M», а это единица
                        измерения, а не подпись. */}
                    <span className="t-caption shrink-0 font-semibold tabular-nums text-[var(--text-1)]">
                      {formatDistance(item.distanceM, locale)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
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
