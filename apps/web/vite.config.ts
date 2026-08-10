import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Воркер MapLibre — модульный, и скрипт с протоколом PMTiles он подгружает в себя
  // через import(). По умолчанию Vite собирает воркеры в iife, который так не
  // импортируется, и регистрация протокола молча не доезжает.
  worker: { format: 'es' },
  server: {
    port: 5173,
    // В разработке /api ведёт в тот же api, что и через edge на проде: клиент
    // ходит по относительному адресу и про порт ничего не знает.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
