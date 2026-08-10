import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // В разработке /api ведёт в тот же api, что и через edge на проде: клиент
    // ходит по относительному адресу и про порт ничего не знает.
    proxy: { '/api': 'http://localhost:3000' },
  },
})
