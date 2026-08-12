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
    <header className="mx-auto flex w-full max-w-[720px] shrink-0 items-center justify-between gap-[var(--s-3)] px-[var(--gutter)] pt-[var(--s-6)] pb-[var(--s-3)] lg:max-w-none lg:border-b lg:border-[var(--border-1)] lg:px-[var(--s-6)] lg:py-[var(--s-3)]">
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
            под большим пальцем, и второй раз наверху не нужно.

            Прячет `max-lg:hidden`, а не `hidden lg:inline-flex`: `inline-flex` уже стоит
            в наборе классов кнопки, и в одном слое он перебивал `hidden` — на 390 px
            кнопка оставалась в шапке и наезжала на марку. Правило в медиазапросе
            выигрывает у безусловного независимо от порядка в атрибуте. */}
        <Link to="/$locale/new" params={{ locale }} className={`${COMPACT_ACCENT} max-lg:hidden`}>
          <Glyph name="plus" size={14} />
          {t('home.cta')}
        </Link>
      </div>
    </header>
  )
}
