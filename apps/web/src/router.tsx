import { createRootRoute, createRoute, createRouter, Navigate, Outlet, redirect } from '@tanstack/react-router'
import { HomePage } from './routes/$locale/index'
import { ReportDetailPage } from './routes/$locale/reports/$number'
import { ReportListPage } from './routes/$locale/reports/index'
import { TrackPage } from './routes/$locale/z/$token'
import { validateReportSearch } from './features/report-filters/searchParams'
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

/** Экран карты — он же главная.
 *
 *  Формы среди маршрутов нет: она открывается окном поверх той страницы, где человек
 *  стоит (`ReportFormProvider`). Маршрутом `/new` она была ребёнком карты, и нажатие
 *  «сообщить о яме» со страницы заявки уносило человека с заявки на главную.
 *
 *  Фильтры объявлены здесь: набор один на карту и на список, переход между ними
 *  обязан его сохранять, а ссылкой на срез — делиться (SRS §7.3). */
const homeRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: '/',
  validateSearch: validateReportSearch,
  component: HomePage,
})

/** Карточка заявки по публичному номеру (US-004). Номер публичен по замыслу и доступа
 *  ни к чему не даёт: заявки и так публичны, перебор даёт то же, что и карта (SRS §9.2). */
const reportDetailRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: 'reports/$number',
  component: ReportDetailPage,
})

/** Список с фильтрами. Источник истины по фильтрам — адрес: ссылку на срез можно
 *  переслать в группу, а «назад» возвращает предыдущий набор, а не сбрасывает его (SRS §7.3). */
const reportListRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: 'reports',
  validateSearch: validateReportSearch,
  component: ReportListPage,
})

/** Страница отслеживания. Токен лежит в пути, поэтому на весь сайт стоит
 *  `Referrer-Policy: no-referrer`, а ответы `/api/track/*` идут с `no-store` (SRS §9.2). */
const trackRoute = createRoute({
  getParentRoute: () => localeRoute,
  path: 'z/$token',
  component: TrackPage,
})

const routeTree = rootRoute.addChildren([
  rootRedirectRoute,
  localeRoute.addChildren([
    homeRoute,
    reportListRoute,
    reportDetailRoute,
    trackRoute,
  ]),
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
