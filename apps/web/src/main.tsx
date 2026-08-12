import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { router } from './router'
import { retryQuery } from './shared/api/retry'
import { isBrowserSupported, UnsupportedBrowser } from './shared/ui/UnsupportedBrowser'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Мобильный трафик в Узбекистане платный, а фокус на телефоне меняется
      // постоянно: перезапрос на каждом возврате в браузер стоил бы жителю денег
      // (PRD §8.1, SRS §7.5).
      refetchOnWindowFocus: false,
      // Ответ, который повтором не исправить, повторять нечего: см. `retryQuery`.
      retry: retryQuery,
    },
  },
})

const container = document.getElementById('root')
if (!container) throw new Error('#root not found in index.html')

// Проверка до монтирования приложения, а не внутри него: браузер, который не умеет
// прочитать фотографию, сломается на форме, и увидеть это житель должен на входе,
// а не после трёх снимков у бордюра (PRD §8.5).
createRoot(container).render(
  isBrowserSupported() ? (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>
  ) : (
    <UnsupportedBrowser />
  ),
)
