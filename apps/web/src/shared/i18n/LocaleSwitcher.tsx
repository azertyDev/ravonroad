import { Link } from '@tanstack/react-router'
import { HTML_LANG, LOCALES, type Locale } from './locale'
import type { UiKey } from './messages'
import { useI18n } from './useI18n'

const NAME_KEY: Record<Locale, UiKey> = { uz: 'locale.uz', ru: 'locale.ru' }
const SHORT_KEY: Record<Locale, UiKey> = { uz: 'locale.uz.short', ru: 'locale.ru.short' }

/** Переключатель языка: сегментированная пара, как на ноутбучном макете.
 *
 *  Меняет только сегмент локали: путь и search-параметры сохраняются, иначе
 *  переключение языка сбрасывало бы выбранные фильтры (US-015).
 *
 *  Без `from` — намеренно: он задаёт базу, относительно которой считается `to`, и
 *  зафиксированный `/$locale` сводил бы «.» к корню локали, отбрасывая всё, что ниже.
 *
 *  Видимая подпись — сокращение языка, а не флаг. Флаг обозначает страну, а не язык,
 *  а корректных SVG в исходных материалах нет: рисовать полумесяц без двенадцати звёзд
 *  на кампанейском сайте нельзя. Полное имя языка остаётся в `aria-label` и `title`. */
export function LocaleSwitcher() {
  const { locale, t } = useI18n()

  return (
    <nav
      aria-label={t('header.localeNavLabel')}
      className="flex items-center gap-[2px] rounded-[var(--r-3)] bg-[var(--surface-control)] p-[3px]"
    >
      {LOCALES.map((value) => (
        <Link
          key={value}
          to="."
          params={{ locale: value }}
          // Подпись всегда на своём языке и в обеих локалях: без lang «OʻZ»
          // на /ru читается русской фонетикой (WCAG 3.1.2). hrefLang — про язык
          // страницы по ссылке, он тот же.
          lang={HTML_LANG[value]}
          hrefLang={HTML_LANG[value]}
          title={t(NAME_KEY[value])}
          aria-label={t(NAME_KEY[value])}
          search={(previous) => previous}
          // Ссылка ведёт на текущую страницу на другом языке — это `page`, а не `true`.
          // Link из роутера проставляет активной ссылке ровно это значение сам;
          // здесь оно записано явно, потому что рядом на него завязан селектор стиля.
          aria-current={value === locale ? 'page' : undefined}
          className="t-chip inline-flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-[var(--r-2)] px-[var(--s-3)] text-[var(--text-2)] aria-[current]:bg-[var(--accent)] aria-[current]:font-extrabold aria-[current]:text-[var(--text-on-accent)]"
        >
          {t(SHORT_KEY[value])}
        </Link>
      ))}
    </nav>
  )
}
