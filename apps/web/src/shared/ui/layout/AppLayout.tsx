import type { ReactNode } from 'react'
import { AppFooter } from './AppFooter'
import { AppHeader } from './AppHeader'

/** Каркас страницы. Ширина содержимого ограничена; проектируем от 360 px,
 *  где горизонтальная прокрутка недопустима (PRD §8.3).
 *
 *  Горизонтальное поле держит не каркас, а сами блоки. В плакатном ключе счётчик
 *  и статус заявки идут во всю ширину экрана, и общий padding на `main` не дал бы
 *  им выйти за поля. Обычный блок берёт поле классом `px-[var(--gutter)]`. */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-[720px] flex-1 pt-[var(--s-4)] pb-[calc(var(--screen-bottom)+var(--safe-bottom))]">
        {children}
      </main>
      <AppFooter />
    </div>
  )
}
