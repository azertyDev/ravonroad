import type { CreateReportResponse } from '@ravonroad/shared-types'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { catalogKeys, fetchDistricts, localizedName } from '../../entities/catalog/api'
import { useI18n } from '../../shared/i18n/useI18n'
import { ActionBar } from '../../shared/ui/control/ActionBar'
import { CTA, GUTTER, SECONDARY } from '../../shared/ui/control/styles'
import { Glyph } from '../../shared/ui/icon/Glyph'
import { StatusChip } from '../../shared/ui/status/StatusChip'

const COPIED_FOR_MS = 2000

/** Экран подтверждения (US-012).
 *
 *  Номер и ссылка показываются сразу, ещё до того, как фотографии обработаны: житель
 *  стоит у ямы, и держать его перед спиннером ради превью — ровно то, чего требование
 *  «заявка принимается всегда» и запрещает (PRD §8.1).
 *
 *  Номер занимает жёлтое поле во всю ширину — ту же плашку, что счётчик кампании
 *  на главной. Это точка узнавания между двумя экранами и главный результат отправки.
 *
 *  Ссылка — единственная capability в системе и показывается ровно один раз: токен
 *  случайный, из номера не выводится и больше нигде не появляется. Поэтому рядом стоит
 *  предупреждение, а не мелкая сноска (SRS §2.1, §9.2). */
export function Confirmation({ report }: { report: CreateReportResponse }) {
  const { locale, t } = useI18n()
  const [copied, setCopied] = useState(false)
  const districts = useQuery({ queryKey: catalogKeys.districts, queryFn: fetchDistricts, staleTime: Infinity })
  const district = districts.data?.find((item) => item.code === report.districtCode)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS)
    return () => clearTimeout(timer)
  }, [copied])

  // Копируется полный адрес: относительный путь бесполезен в мессенджере,
  // а ссылку жители пересылают себе именно туда.
  const url = `${globalThis.location.origin}${report.trackingPath}`

  const copy = (): void => {
    void navigator.clipboard.writeText(url).then(
      () => setCopied(true),
      // Буфер обмена недоступен без https и в части браузеров: ссылка остаётся
      // на экране, её можно выделить руками.
      () => undefined,
    )
  }

  return (
    <section className="flex flex-1 flex-col">
      <div className={`flex flex-col gap-[var(--s-4)] ${GUTTER}`}>
        {/* Знак приёма набран цветом статуса DONE, а не зелёным: чистого зелёного
            в системе нет вовсе — при дейтеранопии он сливается с оранжевым. */}
        <span
          className="grid h-[56px] w-[56px] place-items-center rounded-[var(--r-4)]"
          style={{ background: 'var(--status-done-field)', color: 'var(--status-done-on-field)' }}
        >
          <Glyph name="check" size={26} />
        </span>
        <h1 className="t-display uppercase">{t('form.done.title')}</h1>
        <p className="t-body text-[var(--text-2)]">{t('form.done.lead')}</p>
      </div>

      <div className="mt-[var(--block-gap)] flex flex-wrap items-center justify-between gap-[var(--s-3)] bg-[var(--accent)] px-[var(--gutter)] py-[var(--s-5)] text-[var(--text-on-accent)]">
        <span className="flex flex-col gap-[var(--s-1)]">
          <span className="t-label">{t('form.done.numberLabel')}</span>
          {/* Номер публичен и доступа не даёт ни к чему: им ссылаются в группе
              волонтёров и в отчётах (SRS §2.1). */}
          <span className="t-display tabular-nums">{report.displayNumber}</span>
        </span>
        <StatusChip status={report.status} />
      </div>

      <div className={`mt-[var(--block-gap)] flex flex-col gap-[var(--s-3)] ${GUTTER}`}>
        {district !== undefined && (
          <p className="t-caption text-[var(--text-2)]">{localizedName(district, locale)}</p>
        )}

        <p className="t-label text-[var(--text-2)]">{t('form.done.linkLabel')}</p>
        {/* Обычная ссылка, а не Link роутера: путь настоящий — его собрал сервер
            в локали жителя (SRS §4.2). */}
        <a
          href={report.trackingPath}
          className="t-body break-all underline decoration-[var(--accent)] decoration-2 underline-offset-4"
        >
          {url}
        </a>

        <p className="t-caption rounded-[var(--r-4)] border border-[var(--status-rejected-line)] bg-[var(--status-rejected-tint)] p-[var(--s-3)] text-[var(--status-rejected-ink)]">
          {t('form.done.warning')}
        </p>

        {report.photosPending && (
          // Сообщение, а не спиннер: заявка уже в базе, у неё есть номер и место
          // на карте, и ждать от жителя больше нечего (SRS §4.2).
          <p className="t-caption text-[var(--text-2)]">{t('form.done.photosPending')}</p>
        )}
      </div>

      <ActionBar caption={t('report.trackHint')}>
        <button type="button" onClick={copy} className={CTA}>
          <Glyph name="copy" size={18} />
          {copied ? t('report.copied') : t('report.copyLink')}
        </button>
        <Link to="/$locale" params={{ locale }} className={SECONDARY}>
          {t('form.done.backToMap')}
        </Link>
      </ActionBar>
    </section>
  )
}
