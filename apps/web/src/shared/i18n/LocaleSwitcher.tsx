import { Link } from '@tanstack/react-router'
import ruFlag from '../assets/flags/ru.svg'
import uzFlag from '../assets/flags/uz.svg'
import { HTML_LANG, LOCALES, type Locale } from './locale'
import type { UiKey } from './messages'
import { useI18n } from './useI18n'

const NAME_KEY: Record<Locale, UiKey> = { uz: 'locale.uz', ru: 'locale.ru' }

/** Настоящие флаги вместо прежних градиентов: у узбекского двенадцать звёзд и полумесяц,
 *  и рисовать их прямоугольниками было нечем. Файлы весят 1,5 КБ и 0,3 КБ, то есть Vite
 *  вклеивает их в бандл как data-URI — сетевого запроса за флагом не будет.
 *
 *  Подпись языка остаётся в `aria-label` и `title`, а сам рисунок скрыт от скринридера:
 *  флаг обозначает страну, а не язык, и читать его вслух как язык нельзя. */
const FLAG: Record<Locale, string> = { uz: uzFlag, ru: ruFlag }

/** Переключатель языка: сегментированная пара с флагами.
 *
 *  Меняет только сегмент локали: путь и search-параметры сохраняются, иначе
 *  переключение языка сбрасывало бы выбранные фильтры (US-015).
 *
 *  Без `from` — намеренно: он задаёт базу, относительно которой считается `to`, и
 *  зафиксированный `/$locale` сводил бы «.» к корню локали, отбрасывая всё, что ниже. */
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
          lang={HTML_LANG[value]}
          hrefLang={HTML_LANG[value]}
          title={t(NAME_KEY[value])}
          aria-label={t(NAME_KEY[value])}
          search={(previous) => previous}
          // Ссылка ведёт на текущую страницу на другом языке — это `page`, а не `true`.
          aria-current={value === locale ? 'page' : undefined}
          className="grid min-h-[var(--touch-min)] min-w-[44px] place-items-center rounded-[var(--r-2)] aria-[current]:bg-[var(--accent)]"
        >
          {/* `object-cover` при 26×18: у флагов разные пропорции — 1:2 у узбекского,
              2:3 у российского, — и вписывание оставило бы одному из них поля внутри
              рамки. Обрезка по краям читается как флаг, поля — как ошибка вёрстки. */}
          <img
            src={FLAG[value]}
            alt=""
            aria-hidden="true"
            width={26}
            height={18}
            className={`h-[18px] w-[26px] rounded-[2px] object-cover shadow-[inset_0_0_0_1px_rgba(18,22,28,.35)] ${
              value === locale ? '' : 'opacity-60 grayscale-[.7]'
            }`}
          />
        </Link>
      ))}
    </nav>
  )
}
