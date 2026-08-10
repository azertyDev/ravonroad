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

      {/* В DOM подпись идёт перед значением — иначе <dl> не связывает пару, и
          скринридер объявляет «0» без «Отремонтировано ям». Число над подписью
          возвращает flex-col-reverse: это порядок показа, а не чтения. */}
      <dl className="flex flex-wrap gap-[var(--s-8)]">
        <div className="flex flex-col-reverse gap-[var(--s-1)]">
          <dt className="t-label text-[var(--text-2)]">{t('home.repairedLabel')}</dt>
          <dd className="t-counter">{formatNumber(REPAIRED)}</dd>
        </div>
        <div className="flex flex-col-reverse gap-[var(--s-1)]">
          <dt className="t-label text-[var(--text-2)]">{t('home.goalLabel')}</dt>
          <dd className="t-counter">{formatNumber(CAMPAIGN_GOAL)}</dd>
        </div>
      </dl>
    </div>
  )
}
