import { useEffect } from 'react'

/** Заголовок вкладки и описание страницы (WCAG 2.4.2 Page Titled).
 *
 *  Императивно, а не разметкой: React 19 умеет поднимать `<title>` в `<head>` сам,
 *  но в `<head>` уже стоит `<title>` из index.html, а документ берёт первый — второй
 *  висел бы в разметке, ничего не меняя. Тег описания создаётся при первом вызове:
 *  текст зависит от локали, а локаль известна только маршруту, не сборке.
 *
 *  Прибирать за собой нечему: следующая страница перезаписывает оба значения, а после
 *  последней страницы прибирать уже некому. */
export function usePageMeta(title: string, description: string): void {
  useEffect(() => {
    document.title = title
    const existing = document.head.querySelector('meta[name="description"]')
    const tag = existing ?? document.createElement('meta')
    if (existing === null) {
      tag.setAttribute('name', 'description')
      document.head.append(tag)
    }
    tag.setAttribute('content', description)
  }, [title, description])
}
