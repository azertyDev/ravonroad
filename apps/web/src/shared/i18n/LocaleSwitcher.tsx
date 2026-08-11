import { Link } from '@tanstack/react-router'
import { HTML_LANG, LOCALES, type Locale } from './locale'
import type { UiKey } from './messages'
import { useI18n } from './useI18n'

const NAME_KEY: Record<Locale, UiKey> = { uz: 'locale.uz', ru: 'locale.ru' }

/** Флаги нарисованы градиентами, как в макете, и это заглушки: у узбекского нет
 *  двенадцати звёзд, пропорции у обоих общие 26×18 вместо настоящих 1:2 и 2:3.
 *  Дизайн-система помечает их так же и просит настоящие SVG в `assets/flags/`.
 *
 *  Подпись языка при этом остаётся в `aria-label` и `title`: флаг обозначает страну,
 *  а не язык, и читать его вслух как язык нельзя. */
const FLAG: Record<Locale, React.CSSProperties> = {
  uz: {
    background:
      'linear-gradient(#0099B5 0 32%,#CE1126 32% 34.5%,#FFFFFF 34.5% 65.5%,#CE1126 65.5% 68%,#1EB53A 68% 100%)',
  },
  ru: { background: 'linear-gradient(#FFFFFF 0 33.33%,#0039A6 33.33% 66.66%,#D52B1E 66.66% 100%)' },
}

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
          <span
            aria-hidden="true"
            style={FLAG[value]}
            className={`h-[18px] w-[26px] rounded-[2px] shadow-[inset_0_0_0_1px_rgba(18,22,28,.35)] ${
              value === locale ? '' : 'opacity-60 grayscale-[.7]'
            }`}
          >
            {/* Полумесяц узбекского флага: два круга, второй перекрывает первый.
                Звёзд нет — см. примечание к FLAG. */}
            {value === 'uz' && (
              <span className="relative block h-full w-full overflow-hidden rounded-[2px]">
                <span className="absolute top-[2px] left-[3px] h-[7px] w-[7px] rounded-full bg-[#FFFFFF]" />
                <span className="absolute top-[2px] left-[5px] h-[7px] w-[7px] rounded-full bg-[#0099B5]" />
              </span>
            )}
          </span>
        </Link>
      ))}
    </nav>
  )
}
