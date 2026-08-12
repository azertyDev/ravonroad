import { useEffect } from 'react'
import { detectLocale, HTML_LANG } from '../i18n/locale'
import { MESSAGES } from '../i18n/messages'

/** Браузер определяется по возможностям, а не по строке user-agent (PRD §8.5):
 *  строку подделывают все кому не лень, а `createImageBitmap` либо есть, либо нет.
 *
 *  Проверка ровно одна, и это не небрежность. `OffscreenCanvas` в список не входит:
 *  сжатие обходится обычным `<canvas>`, а Safari получил `OffscreenCanvas` только
 *  в 16.4 — отказывать iPhone на iOS 15 значит выгнать ту самую аудиторию, ради
 *  которой кампания и делается. А без `createImageBitmap` фотографию не прочитать
 *  ничем, то есть форма не работает, и молчать об этом нельзя. */
export function isBrowserSupported(): boolean {
  return typeof createImageBitmap === 'function'
}

/** Сообщение вместо молча сломанной страницы (PRD §8.5, AC-11).
 *
 *  Локаль берётся у браузера, а не из адреса: маршрутизатор здесь ещё не поднят,
 *  и подниматься ему незачем. Конкретных версий в тексте нет намеренно — список
 *  «двух последних мажорных» протухает быстрее, чем выходит релиз, а жителю от него
 *  всё равно нет пользы: он умеет обновить браузер, а не сверить его номер. */
export function UnsupportedBrowser() {
  const locale = detectLocale(navigator.languages)
  const { ui } = MESSAGES[locale]

  // Язык страницы объявляется и здесь: маршрут с локалью до этого экрана не доходит,
  // а без атрибута скринридер прочитает узбекский текст русскими правилами — на
  // единственной странице, которую этот браузер вообще покажет (PRD §8.2).
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[locale]
    document.title = ui['unsupported.title']
  }, [locale, ui])

  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col justify-center gap-[var(--s-4)] px-[var(--gutter)]">
      <h1 className="t-h1 uppercase">{ui['unsupported.title']}</h1>
      <p className="t-body-l text-[var(--text-2)]">{ui['unsupported.text']}</p>
    </main>
  )
}
