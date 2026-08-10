import type { CreateReportResponse } from '@ravonroad/shared-types'
import { useEffect, useState } from 'react'
import { useI18n } from '../../shared/i18n/useI18n'

const COPIED_FOR_MS = 2000

/** Экран подтверждения (US-012).
 *
 *  Номер и ссылка показываются сразу, ещё до того, как фотографии обработаны: житель
 *  стоит у ямы, и держать его перед спиннером ради превью — ровно то, чего требование
 *  «заявка принимается всегда» и запрещает (PRD §8.1).
 *
 *  Ссылка — единственная capability в системе и показывается ровно один раз: токен
 *  случайный, из номера не выводится и больше нигде не появляется. Поэтому рядом стоит
 *  предупреждение, а не мелкая сноска (SRS §2.1, §9.2). */
export function Confirmation({ report }: { report: CreateReportResponse }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

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
    <section className="flex flex-col gap-[var(--block-gap)]">
      <h1 className="t-h1">{t('form.done.title')}</h1>

      <div className="flex flex-col gap-[var(--s-1)]">
        <p className="t-label text-[var(--text-2)]">{t('form.done.numberLabel')}</p>
        {/* Номер публичен и доступа не даёт ни к чему: им ссылаются в группе
            волонтёров и в отчётах (SRS §2.1). */}
        <p className="t-counter">{report.displayNumber}</p>
      </div>

      <div className="flex flex-col gap-[var(--s-2)]">
        <p className="t-label text-[var(--text-2)]">{t('form.done.linkLabel')}</p>
        {/* Обычная ссылка, а не Link роутера: страница отслеживания приходит в 003,
            а путь настоящий — его собрал сервер в локали жителя (SRS §4.2). */}
        <a href={report.trackingPath} className="t-body break-all underline">
          {url}
        </a>

        <button
          type="button"
          onClick={copy}
          className="t-label inline-flex min-h-[var(--touch-base)] w-fit items-center rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
        >
          {copied ? t('form.done.copied') : t('form.done.copy')}
        </button>

        <p className="t-caption text-[var(--status-rejected-ink)]">{t('form.done.warning')}</p>
      </div>

      {report.photosPending && (
        // Сообщение, а не спиннер: заявка уже в базе, у неё есть номер и место
        // на карте, и ждать от жителя больше нечего (SRS §4.2).
        <p className="t-caption text-[var(--text-2)]">{t('form.done.photosPending')}</p>
      )}

      <a
        href={globalThis.location.pathname}
        className="t-label inline-flex min-h-[var(--touch-base)] w-fit items-center rounded-[var(--r-2)] border border-[var(--border-2)] px-[var(--s-4)]"
      >
        {t('form.done.another')}
      </a>
    </section>
  )
}
