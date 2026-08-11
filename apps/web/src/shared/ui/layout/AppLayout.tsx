import type { ReactNode } from 'react'
import { AppFooter } from './AppFooter'
import { AppHeader } from './AppHeader'

/** Каркас страницы. Ширина содержимого ограничена; проектируем от 360 px,
 *  где горизонтальная прокрутка недопустима (PRD §8.3).
 *
 *  Горизонтальное поле держит не каркас, а сами блоки. В плакатном ключе счётчик,
 *  статусное поле и полосы фотографий идут во всю ширину экрана, и общий padding
 *  на `main` не дал бы им выйти за поля. Обычный блок берёт поле классом `GUTTER`.
 *
 *  Подвал стоит после `main`, а нижняя панель действия — внутри него: `sticky`
 *  перестаёт держать панель на дне своего контейнера, поэтому она никогда не
 *  накрывает подвал и не требует под себя постоянного отступа. */
export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Предупреждающая лента — кромка страницы. Одна из двух текстур системы,
          и обе служебные: на карте не появляется ни та, ни другая. */}
      <div aria-hidden="true" className="h-[8px] shrink-0 bg-[image:var(--hazard-tape)]" />
      <AppHeader />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col pt-[var(--s-4)] lg:max-w-[1120px]">
        {children}
      </main>
      <AppFooter />
    </div>
  )
}
