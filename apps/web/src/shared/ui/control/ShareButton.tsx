import { useI18n } from '../../i18n/useI18n'
import { Glyph } from '../icon/Glyph'
import { ICON_BUTTON } from './styles'

/** «Поделиться» системным листом.
 *
 *  Рисуется только там, где `navigator.share` есть: на ноутбуке лист не откроется,
 *  и кнопка, которая ничего не делает, хуже её отсутствия. Копирование ссылки на этих
 *  экранах и так стоит основным действием внизу, поэтому запасного пути тут не нужно.
 *
 *  Заявками делятся в Telegram — там же, где бригада их и разбирает, — и системный
 *  лист попадает туда одним касанием вместо «скопировать, открыть, вставить». */
export function ShareButton({ title }: { title: string }) {
  const { t } = useI18n()
  if (typeof navigator.share !== 'function') return null

  return (
    <button
      type="button"
      aria-label={t('report.share')}
      className={ICON_BUTTON}
      onClick={() => {
        // Отказ — это и «пользователь передумал», и «формат не принят». Обе ветки
        // равно неинтересны: ссылка осталась на экране, а внизу стоит копирование.
        void navigator.share({ title, url: globalThis.location.href }).catch(() => undefined)
      }}
    >
      <Glyph name="copy" />
    </button>
  )
}
