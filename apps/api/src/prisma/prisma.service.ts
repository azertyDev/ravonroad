import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

/** Восемь соединений — бюджет прода (SRS §12.1). На dev их пять, и это не тюнинг:
 *  из 12 `max_connections` Postgres резервирует 3 под суперпользователя, значит обычным
 *  клиентам достаётся 9 — пул 5, миграции 1, `psql` разработчика 1, два в запасе
 *  (SRS §12.2). Пул 8 на dev выбирал почти всё, и первый же параллельный запрос упирался
 *  в ожидание соединения, которое проверка живости трактовала как «база лежит».
 *
 *  Соединение открывается лениво, на первом запросе: api обязан подниматься при
 *  недоступной БД, иначе /health не смог бы ответить 200 (SRS §10.1). */
const DEFAULT_CONNECTION_LIMIT = 8

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
        max: config.get<number>('DB_POOL') ?? DEFAULT_CONNECTION_LIMIT,
      }),
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
