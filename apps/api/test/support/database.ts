import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../src/generated/prisma/client'
import type { PrismaService } from '../../src/prisma/prisma.service'

/** Интеграционные тесты идут в настоящий PostGIS: проверяется ровно то, чего нет
 *  в моках — `ST_Contains` по мультиполигону, CHECK-инварианты, `SKIP LOCKED`
 *  и гонка последовательности (SRS §11.3).
 *
 *  База берётся из `TEST_DATABASE_URL` в окружении оболочки, по умолчанию — та же,
 *  что поднимает docker-compose для разработки. Из `.env` она не читается намеренно:
 *  прогон не должен зависеть от файла, который у каждого свой, и тем более трогать
 *  боевые ключи хранилища из него. */
export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ??
  process.env['DATABASE_URL'] ??
  'postgresql://ravonroad:ravonroad@localhost:5432/ravonroad?schema=public'

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
