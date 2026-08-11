import { detectLocale } from '../i18n/locale'
import { MESSAGES } from '../i18n/messages'

/** Браузер определяется по возможностям, а не по строке user-agent (PRD §8.5):
 *  строку подделывают все кому не лень, а `createImageBitmap` либо есть, либо нет.
 *
 *  Проверка ровно одна, и это не небрежность. `OffscreenCanvas` в список не входит
 *  с тех пор, как compress.ts умеет обычный `<canvas>`: Safari получил его только
 *  в 16.4, и отказывать iPhone на iOS 15 в сайте из-за отсутствующего ускорения —
 *  это выгнать ту самую аудиторию, ради которой кампания и делается. А вот без
 *  `createImageBitmap` фотографию не прочитать ничем, то есть форма не работает,
 *  и молчать об этом нельзя. */
export function isBrowserSupported(): boolean {
  return typeof createImageBitmap === 'function'
}

/** Сообщение вместо молча сломанной страницы (PRD §8.5, AC-11).
 *
 *  Локаль берётся у браузера, а не из адреса: маршрутизатор здесь ещё не поднят,
 *  да и до него дело не дойдёт. Конкретных версий в тексте нет намеренно — список
 *  «двух последних мажорных» протухает быстрее, чем выходит релиз, и жителю от него
 *  всё равно нет пользы: он умеет обновить браузер, а не сверить его номер. */
export function UnsupportedBrowser() {
  const locale = detectLocale(navigator.languages)
  const { ui } = MESSAGES[locale]

  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col justify-center gap-[var(--s-4)] px-[var(--gutter)]">
      <h1 className="t-h1">{ui['unsupported.title']}</h1>
      <p className="t-body-l text-[var(--text-2)]">{ui['unsupported.text']}</p>
    </main>
  )
}
