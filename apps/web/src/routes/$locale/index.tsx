import { PublicMap } from '../../features/report-map/PublicMap'
import { CampaignCounter } from '../../features/stats/CampaignCounter'
import { useI18n } from '../../shared/i18n/useI18n'

export function HomePage() {
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-[var(--block-gap)]">
      <div className="flex flex-col gap-[var(--s-3)]">
        <h1 className="t-display">{t('home.title')}</h1>
        <p className="t-body-l text-[var(--text-2)]">{t('home.lead')}</p>
      </div>

      <CampaignCounter />
      <PublicMap />
    </div>
  )
}
