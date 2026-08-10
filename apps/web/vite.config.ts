import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // .env лежит в корне монорепозитория, а Vite по умолчанию ищет его рядом с собой,
  // в apps/web. Без этого dev-сервер поднимался с пустой VITE_MAP_PMTILES_URL, и карта
  // молча заменялась сообщением «карта недоступна» — при том что в образе она работала:
  // туда значение приходит build-аргументом (Dockerfile.web).
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Контракт берётся исходником, а не сборкой: пакет компилируется в CommonJS
      // ради NestJS, а браузеру такой файл достаётся как ESM, и статический разбор
      // имён проваливается. TypeScript Vite компилирует сам — dist ему не нужен.
      '@ravonroad/shared-types': fileURLToPath(
        new URL('../../packages/shared-types/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    // В разработке /api ведёт в тот же api, что и через edge на проде: клиент
    // ходит по относительному адресу и про порт ничего не знает.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
