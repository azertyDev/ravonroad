import { Link } from '@tanstack/react-router'
import { PublicMap } from '../../features/report-map/PublicMap'
import { CampaignCounter } from '../../features/stats/CampaignCounter'
import { StatusBreakdown } from '../../features/stats/StatusBreakdown'
import { useI18n } from '../../shared/i18n/useI18n'
import { ActionBar } from '../../shared/ui/control/ActionBar'
import { CTA, GUTTER } from '../../shared/ui/control/styles'

/** Главная в плакатном ключе (Home C): обращение, счётчик кампании во всю ширину,
 *  полоса карты и одно действие внизу.
 *
 *  Ноутбук раскладывает то же самое в две колонки: карта слева на всю высоту,
 *  обращение и счётчик справа. Ни одного блока при этом не появляется и не исчезает —
 *  меняется только порядок, поэтому разметка одна на обе ширины. */
export function HomePage() {
  const { locale, t } = useI18n()

  return (
    <div className="flex flex-1 flex-col lg:grid lg:grid-cols-[1fr_420px] lg:items-start lg:gap-[var(--s-8)]">
      {/* Карта. На телефоне — полоса под счётчиком, на ноутбуке — левая колонка
          во всю высоту экрана. Порядок задан `order`, а не второй разметкой:
          два дерева разъехались бы на первой же правке. */}
      <div className="relative order-2 lg:order-1 lg:sticky lg:top-[var(--s-4)]">
        <PublicMap
          locate={false}
          className="h-[196px] lg:h-[calc(100dvh-160px)] lg:min-h-[420px] lg:rounded-[var(--r-4)] lg:border lg:border-[var(--border-1)]"
        />
        {/* Сегментный переключатель слева внизу карты: где смотреть заявки — на карте
            или списком. Вкладки «Sputnik» нет: спутниковых тайлов у нас не существует,
            экстракт векторный. */}
        <nav className="absolute bottom-[var(--s-3)] left-[var(--s-3)] flex overflow-hidden rounded-[var(--r-3)] shadow-[var(--e-2)]">
          <span aria-current="page" className="t-chip bg-[var(--surface-card)] px-[var(--s-4)] py-[var(--s-3)] text-[var(--text-1)]">
            {t('map.tab')}
          </span>
          <Link
            to="/$locale/reports"
            params={{ locale }}
            className="t-chip bg-[rgba(18,22,28,.78)] px-[var(--s-4)] py-[var(--s-3)] text-[#FBFBFD] hover:bg-[rgba(18,22,28,.9)]"
          >
            {t('list.open')}
          </Link>
        </nav>
      </div>

      <div className="order-1 flex flex-col gap-[var(--block-gap)] lg:order-2">
        {/* Заголовок разбит на две строки блочными span'ами, а не жёстким <br>: перенос
            в макете расставлен под 390 px и под узбекский, а русская строка короче. */}
        <div className={`flex flex-col gap-[var(--s-3)] ${GUTTER} lg:px-0`}>
          <h1 className="t-display uppercase">
            <span className="block">{t('home.titleAction')}</span>
            {/* Обещание бригады выделено подложкой на светлой теме и цветом на тёмной:
                токен несёт оба варианта, поэтому строка здесь одна. `box-decoration-break`
                нужен для узбекского — он длиннее и переносится на две строки, а подложка
                обязана обнять обе. */}
            <span className="box-decoration-clone inline bg-[var(--hero-accent-bg)] px-[var(--hero-accent-pad)] text-[var(--hero-accent-ink)]">
              {t('home.titlePromise')}
            </span>
          </h1>
          <p className="t-body text-[var(--text-2)]">{t('home.lead')}</p>
        </div>

        <CampaignCounter />
        <StatusBreakdown />
      </div>

      <ActionBar caption={t('home.ctaCaption')} className="order-3 lg:col-span-2">
        <Link to="/$locale/new" params={{ locale }} className={CTA}>
          {t('home.cta')}
        </Link>
      </ActionBar>
    </div>
  )
}
