import type { ReactNode } from 'react'

interface StepHeaderProps {
  /** Номер шага строкой: «01». Ведущий ноль — часть плаката, а не форматирование числа. */
  step: string
  label: string
  /** Правый край строки: «2 / 3», «Belgilandi». */
  aside?: ReactNode
  /** Необязательный шаг помечен серым, а не жёлтым: жёлтый здесь обещает, что без
   *  этого шага заявку не отправить. */
  optional?: boolean
}

/** Шапка шага формы. Нумерация вместо подписей-инструкций: жёлтая цифра — единственное
 *  украшение формы (Form C).
 *
 *  Это `<legend>` внутри `<fieldset>` у вызывающего, поэтому здесь нет собственного
 *  заголовочного тега: два способа объявить одну группу полей дали бы скринридеру
 *  два разных дерева. */
export function StepHeader({ step, label, aside, optional = false }: StepHeaderProps) {
  return (
    <span className="flex w-full items-baseline gap-[var(--s-3)]">
      <span
        className={`t-step rounded-[var(--r-1)] px-[var(--s-2)] py-[var(--s-1)] ${
          optional
            ? 'bg-[var(--surface-control)] text-[var(--text-2)]'
            : 'bg-[var(--accent)] text-[var(--text-on-accent)]'
        }`}
      >
        {step}
      </span>
      <span className={`t-step ${optional ? 'text-[var(--text-2)]' : 'text-[var(--text-1)]'}`}>{label}</span>
      {aside !== undefined && <span className="t-caption ml-auto text-[var(--text-2)]">{aside}</span>}
    </span>
  )
}
