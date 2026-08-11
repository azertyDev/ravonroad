import { Link } from '@tanstack/react-router'
import { PublicMap } from '../../features/report-map/PublicMap'
import { CampaignCounter } from '../../features/stats/CampaignCounter'
import { useI18n } from '../../shared/i18n/useI18n'
import { ActionBar } from '../../shared/ui/control/ActionBar'
import { COMPACT_ACCENT, CTA, GUTTER } from '../../shared/ui/control/styles'

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
        <PublicMap className="h-[196px] lg:h-[calc(100dvh-160px)] lg:min-h-[420px] lg:rounded-[var(--r-4)] lg:border lg:border-[var(--border-1)]" />
        {/* Полоса карты на телефоне — не рабочая карта, а приглашение: разглядывать
            яму на 196 px нельзя, и рядом стоит вход туда, где можно. */}
        <Link
          to="/$locale/reports"
          params={{ locale }}
          className={`${COMPACT_ACCENT} absolute right-[var(--s-3)] bottom-[var(--s-3)]`}
        >
          {t('list.open')}
        </Link>
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
            <span className="box-decoration-clone inline bg-[var(--hero-accent-bg)] px-[var(--s-1)] text-[var(--hero-accent-ink)]">
              {t('home.titlePromise')}
            </span>
          </h1>
          <p className="t-body text-[var(--text-2)]">{t('home.lead')}</p>
        </div>

        <CampaignCounter />
      </div>

      <ActionBar caption={t('home.ctaCaption')} className="order-3 lg:col-span-2">
        <Link to="/$locale/new" params={{ locale }} className={CTA}>
          {t('home.cta')}
        </Link>
      </ActionBar>
    </div>
  )
}
