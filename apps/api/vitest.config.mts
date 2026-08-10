import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'api',
    // Unit лежат рядом с кодом, интеграционные — в test/: им нужна живая база,
    // и разделение по расширению делает это видимым в имени файла (SRS §11.1).
    include: ['src/**/*.test.ts', 'test/**/*.spec.ts'],
    environment: 'node',
    globalSetup: ['./test/support/global-setup.ts'],
    // Интеграционные тесты делят одну базу: параллельные файлы вычищали бы данные
    // друг у друга посреди прогона.
    fileParallelism: false,
  },
})
