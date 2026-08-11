import { PublicMap } from '../../features/report-map/PublicMap'
import { CampaignCounter } from '../../features/stats/CampaignCounter'
import { useI18n } from '../../shared/i18n/useI18n'

export function HomePage() {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-[var(--block-gap)]">
      {/* Заголовок разбит на две строки блочными span'ами, а не жёстким <br>: перенос
          в макете расставлен под 390 px и под узбекский, а русская строка короче. */}
      <div className="flex flex-col gap-[var(--s-3)] px-[var(--gutter)]">
        <h1 className="t-display uppercase">
          <span className="block">{t('home.titleAction')}</span>
          <span className="block text-[var(--text-accent)]">{t('home.titlePromise')}</span>
        </h1>
        <p className="t-body text-[var(--text-2)]">{t('home.lead')}</p>
      </div>

      <CampaignCounter />
      <PublicMap />
    </div>
  )
}
