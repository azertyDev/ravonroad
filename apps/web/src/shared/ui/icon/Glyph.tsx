/** Служебные значки: шеврон, плюс, крест, три полосы фильтра, копирование, косая черта.
 *
 *  Готового набора иконок в исходных материалах нет, и он не выдумывался: значки
 *  строятся той же геометрией, что и формы статусов внутри пина — прямые штрихи 2–2.5 px
 *  без скруглений (readme › Iconography). Эмодзи и юникод-символы как значки не годятся:
 *  их форма меняется между платформами, а форма здесь несёт смысл.
 *
 *  Разделены со `StatusMark` намеренно. Тот привязан к статусам и к пину на карте и
 *  заменяться не вправе; эти — служебные, и если появится боевой линейный набор,
 *  меняются только они.
 */
export const GLYPHS = ['back', 'down', 'plus', 'close', 'copy', 'filter', 'check', 'slash', 'locate'] as const

export type GlyphName = (typeof GLYPHS)[number]

const PATH: Record<GlyphName, React.ReactNode> = {
  back: <path d="M10 2.5 4.5 8 10 13.5" />,
  down: <path d="M2.5 5.5 8 11 13.5 5.5" />,
  plus: <path d="M8 1.5v13M1.5 8h13" />,
  close: <path d="M3 3 13 13M13 3 3 13" />,
  // Передний квадрат целиком, задний — только видимой частью: перекрытие пришлось бы
  // закрашивать фоном кнопки, а он у неё разный в двух темах.
  copy: <path d="M5.5 5.5h9v9h-9zM10 3V1.5H1.5V10H3" />,
  filter: <path d="M1.5 4h13M4 8h8M6.5 12h3" />,
  check: <path d="M2.5 8.5 6 12l7.5-8" />,
  slash: <path d="M2.5 13.5 13.5 2.5" />,
  locate: (
    <>
      <circle cx="8" cy="8" r="3.5" />
      <path d="M8 .5v2.5M8 13v2.5M.5 8H3M13 8h2.5" />
    </>
  ),
}

interface GlyphProps {
  name: GlyphName
  /** Сторона в пикселях; штрих остаётся 2 при любом размере — он задан в системе координат. */
  size?: number
  /** Подпись для скринридера. Без неё значок декоративен и рядом обязан стоять текст:
   *  значок без подписи допустим только там, где слово стоит вплотную. */
  label?: string
}

export function Glyph({ name, size = 16, label }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      // Скруглений нет: та же геометрия, что у форм статусов внутри пина.
      strokeLinecap="butt"
      role={label === undefined ? 'presentation' : 'img'}
      aria-label={label}
      aria-hidden={label === undefined}
      focusable="false"
      className="shrink-0"
    >
      {PATH[name]}
    </svg>
  )
}
