import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'prisma/config'

// В Prisma 7 строку подключения для CLI читает этот файл, а не schema.prisma.
// .env лежит в корне монорепозитория, CLI запускается из apps/api; в контейнере
// миграций файла нет и переменные приходят из окружения.
const rootEnvFile = resolve(process.cwd(), '../../.env')
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile)

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // Не env() из prisma/config: он падает на отсутствующей переменной, а prisma generate
  // запускается на postinstall в CI и при сборке образа, где базы данных нет вовсе.
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
})
