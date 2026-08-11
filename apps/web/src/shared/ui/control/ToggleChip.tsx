import type { ReportStatus } from '@ravonroad/shared-types'
import type { ReactNode, Ref } from 'react'
import { StatusMark } from '../status/StatusMark'
import { STATUS_SLUG } from '../status/statusShape'

interface ToggleChipProps {
  /** `checkbox` — несколько статусов сразу, `radio` — одна категория из списка. */
  type: 'checkbox' | 'radio'
  /** Общее имя группы для `radio`; без него браузер не связывает переключатели. */
  name?: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** Статус окрашивает выбранную плашку своими тремя токенами и ставит рядом свою форму —
   *  ту же, что внутри пина на карте. Без него выбранная плашка жёлтая. */
  status?: ReportStatus
  /** Ссылка на сам `<input>`: форма переводит сюда фокус, когда группа не заполнена. */
  ref?: Ref<HTMLInputElement>
  children: ReactNode
}

/** Плашка-переключатель: фильтр по статусу, выбор категории.
 *
 *  Внутри настоящий `<input>`, спрятанный `sr-only`, а не `<button aria-pressed>`:
 *  флажки и радиогруппа приходят с готовой семантикой, со стрелками внутри группы и
 *  с объявлением «выбрано / не выбрано» без единого атрибута с нашей стороны.
 *
 *  Выбранное состояние несёт не только цвет: у статуса это ещё и его форма, у категории —
 *  вес 800 против 600. Цвет как единственный носитель здесь запрещён так же, как на карте.
 *
 *  Капслоком набраны только статусы: их имена короткие и служебные. Категории идут
 *  обычным регистром — «Piyodalar yoʻlakchasidagi chuqur» капслоком не читается,
 *  и правило системы запрещает это прямо (readme › Visual foundations). */
export function ToggleChip({ type, name, checked, onChange, status, ref, children }: ToggleChipProps) {
  const slug = status === undefined ? null : STATUS_SLUG[status]
  const typography = slug === null ? `t-body ${checked ? 'font-extrabold' : 'font-semibold'}` : 't-chip'

  return (
    <label
      className={`chip-focus ${typography} inline-flex min-h-[var(--touch-min)] cursor-pointer items-center gap-[var(--s-2)] rounded-[var(--r-3)] px-[var(--s-4)] py-[var(--s-3)] ${
        checked
          ? slug === null
            ? 'border-2 border-[var(--accent)] bg-[var(--accent)] text-[var(--text-on-accent)]'
            : 'border-2'
          : 'border-[1.5px] border-[var(--border-2)] bg-[var(--surface-card)] text-[var(--text-2)] hover:bg-[var(--surface-control-hover)]'
      }`}
      style={
        checked && slug !== null
          ? {
              background: `var(--status-${slug}-tint)`,
              color: `var(--status-${slug}-ink)`,
              borderColor: `var(--status-${slug}-ink)`,
            }
          : undefined
      }
    >
      <input
        ref={ref}
        type={type}
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      {status !== undefined && <StatusMark status={status} size={12} />}
      {children}
    </label>
  )
}
