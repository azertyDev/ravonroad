import { Outlet, useParams } from '@tanstack/react-router'
import { useEffect } from 'react'

/** Корень локали. Держит <html lang> в согласии с сегментом пути (PRD §8.2):
 *  без этого скринридер читал бы узбекский текст русскими правилами. */
export function LocaleLayout() {
  const { locale } = useParams({ from: '/$locale' })

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return <Outlet />
}
