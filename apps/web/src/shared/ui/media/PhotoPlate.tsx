/** Фотографии «до / после» идут в край, без карточки и без рамки (readme › Изображения).
 *
 *  Подпись лежит поверх снимка и инвертируется по теме: на тёмной светлая плашка
 *  с тёмным текстом, на светлой — тёмная со светлым. Иначе она держится на одном
 *  снимке и пропадает на другом, а снимки здесь пользовательские: асфальт днём
 *  и он же в свете фар.
 */

interface PhotoPlateProps {
  src: string
  alt: string
  /** «Oldin» / «Keyin». Капслоком: подпись короткая и служебная. */
  caption: string
  /** `done` красит подпись бирюзовым: снимок «после» принадлежит закрытой заявке. */
  tone?: 'neutral' | 'done'
  /** Открыть снимок во весь экран. Раньше здесь была ссылка в новую вкладку — она
   *  уводила со страницы заявки в файл на чужом домене, откуда возвращались кнопкой
   *  «назад», а яму на телефоне разглядывают с увеличением. */
  onOpen?: () => void
}

const CAPTION =
  't-label absolute bottom-[var(--s-3)] left-[var(--s-3)] rounded-[var(--r-1)] px-[var(--s-2)] py-[var(--s-1)] text-[var(--surface-page)]'

export function PhotoPlate({ src, alt, caption, tone = 'neutral', onOpen }: PhotoPlateProps) {
  const image = (
    <>
      <img src={src} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      <span
        className={CAPTION}
        style={{ background: tone === 'done' ? 'var(--status-done-ink)' : 'var(--text-2)' }}
      >
        {caption}
      </span>
    </>
  )

  return (
    // Портрет на телефоне и альбом на ноутбуке: снимают яму стоя, а на широком экране
    // пара занимает всю ширину карточки, и портрет уводил бы историю за нижний край
    // (Report C — 3/4, Desktop C — 4/3).
    <div className="relative aspect-[3/4] overflow-hidden bg-[image:var(--hatch-placeholder)] lg:aspect-[4/3]">
      {onOpen === undefined ? (
        image
      ) : (
        // Кнопка, а не ссылка: снимок открывается поверх этой же страницы, никуда
        // не уводя. Клавиатура получает то же действие бесплатно.
        <button type="button" onClick={onOpen} className="block h-full w-full cursor-zoom-in">
          {image}
        </button>
      )}
    </div>
  )
}

/** Место снимка, которого ещё нет. Названо словами, а не оставлено пустым: пустая
 *  клетка читается как поломка страницы, а ожидание поломкой не является — поэтому
 *  плита серая с пунктиром, а не красная (Report C). */
export function PhotoPending({ caption }: { caption: string }) {
  return (
    // Высота у места снимка своя, а не пропорция кадра: рядом со снимками сетка всё равно
    // растянет его на высоту ряда, а в одиночку — у заявки без фотографий — пропорция
    // 4/3 во всю ширину карточки давала полосу пустоты в пол-экрана.
    <p className="t-chip grid min-h-[160px] place-items-center border-2 border-dashed border-[var(--border-2)] bg-[var(--surface-sunken)] p-[var(--s-4)] text-center text-[var(--text-3-sunken)]">
      {caption}
    </p>
  )
}
