import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
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
