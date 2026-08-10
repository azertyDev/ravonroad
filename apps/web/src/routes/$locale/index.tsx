import { formatNumber } from '../../shared/format/number'
import { useI18n } from '../../shared/i18n/useI18n'

/** Цель кампании — 10 000 отремонтированных ям (CLAUDE.md › Продукт). */
const CAMPAIGN_GOAL = 10000

/** Заявок в системе ещё нет: таблица report приходит в 002, вместе с ней —
 *  запрос счётчика. До тех пор отремонтировано ровно ноль, и это не заглушка. */
const REPAIRED = 0

export function HomePage() {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-[var(--block-gap)]">
      <div className="flex flex-col gap-[var(--s-3)]">
        <h1 className="t-display">{t('home.title')}</h1>
        <p className="t-body-l text-[var(--text-2)]">{t('home.lead')}</p>
      </div>

      <dl className="flex flex-wrap gap-[var(--s-8)]">
        <div className="flex flex-col gap-[var(--s-1)]">
          <dd className="t-counter">{formatNumber(REPAIRED)}</dd>
          <dt className="t-label text-[var(--text-2)]">{t('home.repairedLabel')}</dt>
        </div>
        <div className="flex flex-col gap-[var(--s-1)]">
          <dd className="t-counter">{formatNumber(CAMPAIGN_GOAL)}</dd>
          <dt className="t-label text-[var(--text-2)]">{t('home.goalLabel')}</dt>
        </div>
      </dl>
    </div>
  )
}
