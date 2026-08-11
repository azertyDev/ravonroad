import { Link } from '@tanstack/react-router'
import { LocaleSwitcher } from '../../i18n/LocaleSwitcher'
import { useI18n } from '../../i18n/useI18n'
import { COMPACT_ACCENT } from '../control/styles'
import { Glyph } from '../icon/Glyph'

/** Шапка сайта: марка и переключатель языка.
 *
 *  Без заливки и без границы: в плакатном ключе фон экрана одноцветный, и полоса
 *  другого тона под шапкой резала бы его на две части ещё до заголовка. Отделяет
 *  шапку предупреждающая лента над ней, а не линия под ней.
 *
 *  Переключатель языка стоит здесь и на форме тоже: русскоязычный житель обнаруживает,
 *  что сайт на узбекском, ровно в тот момент, когда начинает её заполнять. */
export function AppHeader() {
  const { locale, t } = useI18n()

  return (
    <header className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-[var(--s-3)] px-[var(--gutter)] pt-[var(--s-6)] pb-[var(--s-3)] lg:max-w-[1120px]">
      <div className="flex min-w-0 items-center gap-[var(--s-4)]">
        <Link
          to="/$locale"
          params={{ locale }}
          className="t-h3 inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--r-2)] font-extrabold tracking-[-.02em]"
        >
          {t('app.name')}
        </Link>
        {/* Слоган только на широком экране: на телефоне он съедает строку, в которой
            и так живут марка и язык. */}
        <span className="t-section hidden border-l border-[var(--border-1)] pl-[var(--s-4)] text-[var(--text-2)] lg:inline">
          {t('app.slogan')}
        </span>
      </div>
      <div className="flex items-center gap-[var(--s-3)]">
        <LocaleSwitcher />
        {/* Действие в шапке — только на широком экране: на телефоне оно стоит внизу,
            под большим пальцем, и второй раз наверху не нужно. */}
        <Link to="/$locale/new" params={{ locale }} className={`${COMPACT_ACCENT} hidden lg:inline-flex`}>
          <Glyph name="plus" size={14} />
          {t('home.cta')}
        </Link>
      </div>
    </header>
  )
}
