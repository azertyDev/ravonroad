import type { ReactNode } from 'react'
import { AppFooter } from './AppFooter'
import { AppHeader } from './AppHeader'

/** Каркас страницы. Ширина содержимого ограничена, поля — из токена --gutter:
 *  проектируем от 360 px, где горизонтальная прокрутка недопустима (PRD §8.3). */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-[var(--gutter)] py-[var(--block-gap)]">
        {children}
      </main>
      <AppFooter />
    </div>
  )
}
