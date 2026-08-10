import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

/** Пул на 8 соединений — бюджет SRS §12.1 при db.max_connections = 20 на проде
 *  и 10 на dev. Соединение открывается лениво, на первом запросе: api обязан
 *  подниматься при недоступной БД, иначе /health не смог бы ответить 200 (SRS §10.1). */
const CONNECTION_LIMIT = 8

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
        max: CONNECTION_LIMIT,
      }),
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
