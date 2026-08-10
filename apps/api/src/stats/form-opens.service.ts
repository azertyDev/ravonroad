import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class FormOpensService {
  constructor(private readonly prisma: PrismaService) {}

  /** Один счётчик в сутки — знаменатель конверсии формы, метрика P-1 (SRS §2.13).
   *
   *  Ни cookie, ни идентификатора, ни IP: посуточного числа для метрики достаточно,
   *  а всё, что различало бы посетителей, было бы профилированием, запрещённым PRD §9.4.
   *  Внешняя аналитика по той же причине не подключается.
   *
   *  День берётся в UTC — в той же шкале, в которой лежат `created_at` заявок. Считать
   *  открытия по ташкентским суткам, а заявки по UTC значило бы делить одно на другое
   *  со сдвигом в пять часов. */
  async increment(now: Date = new Date()): Promise<void> {
    const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`)
    await this.prisma.formOpenCounter.upsert({
      where: { day },
      create: { day, count: 1 },
      update: { count: { increment: 1 } },
    })
  }
}
