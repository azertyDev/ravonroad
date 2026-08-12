/** Классы органов управления направления C, собранные в одном месте.
 *
 *  Не компоненты, а строки классов: кнопка здесь бывает и `<button>`, и `<a>`, и
 *  `<label>` над скрытым `<input type="file">`. Обернув их в компонент, пришлось бы
 *  тащить наружу `as`-проп и полиморфные типы ради одинакового набора отступов.
 *
 *  Состояния взяты из дизайн-системы дословно: наведение — светлее на ступень,
 *  нажатие — темнее на ступень и сдвиг на 1 px. Никаких `scale`: палец и так
 *  закрывает кнопку, и уменьшение под пальцем не видно.
 */

/** Основная кнопка: жёлтое поле во всю ширину, капслок, 58 px. Одна на экран —
 *  главное действие живёт в нижней трети (readme › Раскладка). */
export const CTA =
  't-cta inline-flex min-h-[var(--touch-cta)] w-full items-center justify-center gap-[var(--s-3)]' +
  ' rounded-[var(--r-4)] bg-[var(--accent)] px-[var(--s-5)] text-center text-[var(--text-on-accent)]' +
  ' hover:bg-[var(--accent-hover)] active:translate-y-px active:bg-[var(--accent-press)]'

/** Та же кнопка, пока действие ещё невозможно. Не `disabled`: нажатие обязано
 *  остаться доступным, потому что именно оно переводит фокус на незаполненное поле
 *  и показывает, чего не хватает (AC-1). Отключённая кнопка молчит и не фокусируется. */
export const CTA_MUTED =
  't-cta inline-flex min-h-[var(--touch-cta)] w-full items-center justify-center gap-[var(--s-3)]' +
  ' rounded-[var(--r-4)] bg-[var(--surface-control)] px-[var(--s-5)] text-center text-[var(--text-2)]'

/** Вторичное действие: контур без заливки, 48 px. */
export const SECONDARY =
  't-action inline-flex min-h-[var(--touch-base)] w-full items-center justify-center gap-[var(--s-2)]' +
  ' rounded-[var(--r-4)] border-[1.5px] border-[var(--border-control)] px-[var(--s-4)] text-center' +
  ' text-[var(--text-1)] hover:bg-[var(--surface-control-hover)] active:translate-y-px'

/** Компактное действие в ряду: фильтр, «показать ещё», «очистить». Ширина по контенту. */
export const COMPACT =
  't-chip inline-flex min-h-[var(--touch-min)] items-center justify-center gap-[var(--s-2)]' +
  ' rounded-[var(--r-2)] border border-[var(--border-2)] bg-[var(--surface-card)] px-[var(--s-4)]' +
  ' py-[var(--s-3)] text-[var(--text-2)] hover:bg-[var(--surface-control-hover)] active:translate-y-px'

/** То же, но жёлтым: активный вход в фильтры и любое действие, ведущее вперёд. */
export const COMPACT_ACCENT =
  't-chip inline-flex min-h-[var(--touch-min)] items-center justify-center gap-[var(--s-2)]' +
  ' rounded-[var(--r-2)] bg-[var(--accent)] px-[var(--s-4)] py-[var(--s-3)] text-[var(--text-on-accent)]' +
  ' hover:bg-[var(--accent-hover)] active:translate-y-px active:bg-[var(--accent-press)]'

/** Квадратная кнопка с одной геометрической иконкой: назад, закрыть, поделиться.
 *  44 px — минимум WCAG 2.2 §2.5.8, и он же здесь максимум: в шапке рядом стоит номер. */
export const ICON_BUTTON =
  'grid h-[var(--touch-min)] w-[var(--touch-min)] shrink-0 place-items-center rounded-[var(--r-3)]' +
  ' bg-[var(--surface-control)] text-[var(--text-1)] hover:bg-[var(--surface-control-hover)]'

/** Поле ввода. 52 px, а не 48: мимо поля палец промахивается чаще, чем мимо кнопки,
 *  и кегль внутри обязан остаться 16 — ниже iOS зумит страницу при фокусе. */
export const FIELD =
  'min-h-[var(--touch-field)] w-full rounded-[var(--r-4)] border-[1.5px] border-[var(--border-2)]' +
  ' bg-[var(--surface-card)] px-[var(--s-4)] py-[var(--s-3)] text-[length:var(--t-min-input)]' +
  ' text-[var(--text-1)]'

/** Поле, которое не прошло проверку. Красный здесь допустим: он занят статусом
 *  REJECTED только на карте, а в форме статусов нет вовсе. */
export const FIELD_INVALID =
  'min-h-[var(--touch-field)] w-full rounded-[var(--r-4)] border-2 border-[var(--status-rejected-pin)]' +
  ' bg-[var(--surface-card)] px-[var(--s-4)] py-[var(--s-3)] text-[length:var(--t-min-input)]' +
  ' text-[var(--text-1)]'

/** Блок во всю ширину экрана — счётчик, статусное поле, полоса офлайна. Поле
 *  страницы держат сами блоки, поэтому обычный блок берёт этот класс, а плакатный нет. */
export const GUTTER = 'px-[var(--gutter)]'
