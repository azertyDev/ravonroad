import { useI18n } from '../../i18n/useI18n'

const CONTACT_URL = import.meta.env.VITE_CAMPAIGN_CONTACT_URL

/** «Telegram · @ravonroad» из того же адреса, что и ссылка связи: имя канала стоит
 *  в подвале макета, а отдельной переменной под него нет и заводить её не за что.
 *  Адрес не в Telegram — остаётся общая подпись «связаться с кампанией».
 *
 *  Разбор стандартным `URL`, а не выражением: он же отсеивает мусорное значение
 *  переменной сборки, из-за которого подвал иначе показал бы «@» и пустоту. */
function telegramLabel(url: string): string | null {
  try {
    const parsed = new URL(url)
    const handle = parsed.pathname.replace(/^\/+/, '')
    return parsed.host === 't.me' && handle !== '' ? `Telegram · @${handle}` : null
  } catch {
    return null
  }
}

/** Подвал: одна строка про то, кто ведёт проект, и связь с кампанией.
 *
 *  Государство в тексте не упоминается — его в процессе и нет (readme › Content
 *  fundamentals). Строка стоит после нижней панели действия и прокручивается под неё:
 *  главное действие экрана она не перебивает.
 *
 *  На ноутбуке это строка по кромке карточки: слева волонтёры, справа канал
 *  (Desktop C). Запас под домашнюю полосу телефона там не нужен, и подвал сжимается
 *  до одной высоты строки. */
export function AppFooter() {
  const { t } = useI18n()
  const contact = CONTACT_URL === undefined || CONTACT_URL === '' ? null : CONTACT_URL

  return (
    <footer className="mx-auto w-full max-w-[720px] shrink-0 px-[var(--gutter)] pt-[var(--s-5)] pb-[calc(var(--screen-bottom)+var(--safe-bottom))] lg:max-w-none lg:border-t lg:border-[var(--border-1)] lg:px-[var(--s-6)] lg:py-[var(--s-4)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--s-3)]">
        <p className="t-caption text-[var(--text-2)]">
          {t('footer.volunteers')}{' '}
          {/* Атрибуция OSM переехала сюда с самой карты. Убрать её нельзя — ODbL требует
              указания источника, — а значок «i» в углу карты закрывал собой то место,
              ради которого карта и открыта. Строка в подвале выполняет то же требование
              и стоит на каждом экране, включая те, где карты нет вовсе. */}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-[var(--border-1)] underline-offset-2"
          >
            © OpenStreetMap
          </a>
        </p>
        {contact !== null && (
          <a
            href={contact}
            className="t-chip inline-flex min-h-[var(--touch-min)] items-center rounded-[var(--r-2)] text-[var(--text-2)] underline decoration-[var(--accent)] decoration-2 underline-offset-4 lg:min-h-0 lg:no-underline"
          >
            {telegramLabel(contact) ?? t('footer.contact')}
          </a>
        )}
      </div>
    </footer>
  )
}
