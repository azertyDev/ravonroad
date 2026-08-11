import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  hint: string
  /** Выходы из пустоты: сбросить фильтры, показать весь город. */
  children?: ReactNode
}

/** «Показывать нечего». Не забирает экран целиком и не прячет карту под собой:
 *  человек должен видеть, куда сдвинуться, а оба выхода лежать в зоне большого пальца
 *  (Mobile States C).
 *
 *  Пунктирная рамка, а не сплошная: пусто — не ошибка. */
export function EmptyState({ title, hint, children }: EmptyStateProps) {
  return (
    <div
      role="status"
      className="flex flex-col gap-[var(--s-3)] rounded-[var(--r-4)] border border-dashed border-[var(--border-2)] bg-[var(--surface-card)] p-[var(--s-5)] text-center"
    >
      <p className="t-h2 uppercase">{title}</p>
      <p className="t-body text-[var(--text-2)]">{hint}</p>
      {children}
    </div>
  )
}
