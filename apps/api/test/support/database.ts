import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client'
import type { PrismaService } from '../../src/prisma/prisma.service'

/** Интеграционные тесты идут в настоящий PostGIS: проверяется ровно то, чего нет
 *  в моках — `ST_Contains` по мультиполигону, CHECK-инварианты, `SKIP LOCKED`
 *  и гонка последовательности (SRS §11.3).
 *
 *  Адрес ставит `global-setup`, подняв контейнер на прогон. Умолчания нет намеренно:
 *  молчаливый откат на локальную базу однажды вычистил бы чужую рабочую. */
export const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'] ?? ''

/** Сервисы принимают `PrismaService`, но пользуются только клиентом: единственное, что
 *  сервис добавляет поверх, — `onModuleDestroy`, то есть жизненный цикл Nest, которого
 *  в тесте нет.
 *  Приведение стоит здесь один раз, чтобы тесты читались как обычный вызов конструктора. */
export function createTestPrisma(): PrismaService {
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL, max: 5 }) })
  return client as unknown as PrismaService
}

/** Между тестами чистятся только таблицы данных. `district` и `category` наполняет
 *  миграция, и вычищать их значило бы тестировать не ту базу, что накатывается в проде. */
export async function truncateData(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE report, report_photo, abuse_signal, report_status_history, form_open_counter RESTART IDENTITY CASCADE',
  )
}
