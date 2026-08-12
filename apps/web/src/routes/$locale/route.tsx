import { Outlet, useParams } from '@tanstack/react-router'
import { useEffect } from 'react'
import { ReportFormProvider } from '../../features/report-form/ReportFormDialog'
import { HTML_LANG, isLocale } from '../../shared/i18n/locale'
import { AppLayout } from '../../shared/ui/layout/AppLayout'

/** Корень локали. Держит <html lang> в согласии с сегментом пути (PRD §8.2):
 *  без этого скринридер читал бы узбекский текст русскими правилами. */
export function LocaleLayout() {
  const { locale } = useParams({ from: '/$locale' })

  useEffect(() => {
    // Сегмент пути — `uz`, письменность в lang указывается явно: см. HTML_LANG.
    if (isLocale(locale)) document.documentElement.lang = HTML_LANG[locale]
  }, [locale])

  // Окно формы висит на уровне локали, а не маршрута: кнопка «сообщить о яме» есть
  // на каждом экране, и ни один из них не должен из-под человека уезжать.
  return (
    <ReportFormProvider>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </ReportFormProvider>
  )
}
