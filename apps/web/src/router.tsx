import { createRootRoute, createRoute, createRouter, Navigate, Outlet, redirect } from '@tanstack/react-router'
import { HomePage } from './routes/$locale/index'
import { NewReportPage } from './routes/$locale/new'
import { ReportDetailPage } from './routes/$locale/reports/$number'
import { LocaleLayout } from './routes/$locale/route'
import { DEFAULT_LOCALE, detectLocale, isLocale } from './shared/i18n/locale'

const rootRoute = createRootRoute({ component: Outlet })

/** «/» без локали — редирект: адрес всегда несёт язык, чтобы ссылкой можно было
 *  поделиться и получатель увидел тот же язык (US-015). */
const rootRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({
      to: '/$locale',
      params: { locale: detectLocale(navigator.languages) },
      replace: true,
    })
  },
  component: Outlet,
})

const localeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$locale',
  beforeLoad: ({ params }) => {
    // /de/ — не ошибка для жителя, а промах: он должен увидеть сайт, а не белый экран.
    if (!isLocale(params.locale)) {
      throw redirect({ to: '/$locale', params: { locale: DEFAULT_LOCALE }, replace: true })
    }
  },
  component: LocaleLayout,
})

const homeRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: '/',
  component: HomePage,
})

const newReportRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: 'new',
  component: NewReportPage,
})

/** Карточка заявки по публичному номеру (US-004). Номер публичен по замыслу и доступа
 *  ни к чему не даёт: заявки и так публичны, перебор даёт то же, что и карта (SRS §9.2). */
const reportDetailRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: 'reports/$number',
  component: ReportDetailPage,
})

const routeTree = rootRoute.addChildren([
  rootRedirectRoute,
  localeRoute.addChildren([homeRoute, newReportRoute, reportDetailRoute]),
])

export const router = createRouter({
  routeTree,
  // Неизвестный путь — не 404-страница: жителю нужен сайт, а не сообщение об ошибке.
  defaultNotFoundComponent: () => (
    <Navigate to="/$locale" params={{ locale: DEFAULT_LOCALE }} replace />
  ),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
