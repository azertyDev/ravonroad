import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LocaleSwitcher } from './LocaleSwitcher'

/** Проверяется разметка, а не вызов роутера: ошибка жила в опциях ссылки, и только
 *  ссылка, построенная из реального компонента, её показывает. Маршрут `reports`
 *  здесь тестовый — на корне локали подмена базы не видна, ломается всё, что ниже. */
async function switcherMarkupAt(href: string): Promise<string> {
  const rootRoute = createRootRoute({ component: Outlet })
  const localeRoute = createRoute({ getParentRoute: () => rootRoute, path: '$locale', component: Outlet })
  const reportsRoute = createRoute({ getParentRoute: () => localeRoute, path: 'reports', component: LocaleSwitcher })
  const router = createRouter({
    routeTree: rootRoute.addChildren([localeRoute.addChildren([reportsRoute])]),
    history: createMemoryHistory({ initialEntries: [href] }),
  })

  await router.load()
  return renderToStaticMarkup(createElement(RouterProvider, { router }))
}

describe('LocaleSwitcher', () => {
  it('сохраняет путь ниже локали и search-параметры (US-015)', async () => {
    const markup = await switcherMarkupAt('/ru/reports?status=NEW')

    expect(markup.match(/(?<=href=")[^"]*/g)).toEqual(['/uz/reports?status=NEW', '/ru/reports?status=NEW'])
  })

  it('называет язык каждой подписи, включая письменность (WCAG 3.1.2)', async () => {
    const markup = await switcherMarkupAt('/ru/reports')

    // Регистр имени атрибута не важен: HTML-парсер приводит его к нижнему.
    expect(markup.match(/(?<= lang=")[^"]*/g)).toEqual(['uz-Latn', 'ru'])
    expect(markup.match(/(?<=hreflang=")[^"]*/gi)).toEqual(['uz-Latn', 'ru'])
  })
})
