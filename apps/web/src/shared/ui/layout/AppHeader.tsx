import { Link } from '@tanstack/react-router'
import { LocaleSwitcher } from '../../i18n/LocaleSwitcher'
import { useI18n } from '../../i18n/useI18n'

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
      <Link
        to="/$locale"
        params={{ locale }}
        className="t-h3 inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--r-2)] font-extrabold tracking-[-.02em]"
      >
        {t('app.name')}
      </Link>
      <LocaleSwitcher />
    </header>
  )
}
