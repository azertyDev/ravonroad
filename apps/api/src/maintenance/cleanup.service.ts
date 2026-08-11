import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { logEvent } from '../common/logger'
import { PrismaService } from '../prisma/prisma.service'

/** Суточная очистка персональных данных и служебных таблиц (SRS §9.8, §2.11, §2.12,
 *  PRD §9.2.5).
 *
 *  Сроки — не оценка объёма, а обязательство перед жителем: он оставил телефон, чтобы
 *  бригада уточнила адрес, а не чтобы кампания хранила его вечно. Поэтому задача работает
 *  сама и молча, а не «когда вспомним».
 *
 *  Планировщик — `setInterval` в том же процессе, как у обоих воркеров: ни cron-контейнера,
 *  ни `@nestjs/schedule` — при бюджете 1 ГБ на dev (SRS §12.2) четвёртый постоянный процесс
 *  ради четырёх запросов в сутки не окупается. Первый проход — через минуту после старта,
 *  иначе перезапуск чаще суток означал бы, что задача не отрабатывает никогда. */
const FIRST_RUN_DELAY_MS = 60_000
const INTERVAL_MS = 24 * 60 * 60_000

/** SRS §9.8: адрес нужен антиабузу, а он смотрит на час, а не на месяц. */
const IP_RETENTION_DAYS = 30

/** PRD §9.2.5: 90 дней после **терминального** статуса, а не после создания. Заявка,
 *  которую год чинят, контакты не теряет. */
const CONTACTS_RETENTION_DAYS = 90

/** SRS §2.11: рубеж идемпотентности переживает любой разумный повтор апдейта. */
const PROCESSED_UPDATE_RETENTION_DAYS = 7

export interface CleanupOutcome {
  ipCleared: number
  contactsDeleted: number
  processedUpdates: number
  botPrompts: number
}

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private timers: ReturnType<typeof setTimeout>[] = []

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const first = setTimeout(() => {
      void this.runSafely()
      const repeat = setInterval(() => void this.runSafely(), INTERVAL_MS)
      repeat.unref()
      this.timers.push(repeat)
    }, FIRST_RUN_DELAY_MS)
    first.unref()
    this.timers.push(first)
  }

  onModuleDestroy(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers = []
  }

  private async runSafely(): Promise<void> {
    try {
      await this.run()
    } catch (error) {
      logEvent('error', 'cleanup_failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Публичный, потому что интеграционный тест гоняет проход шагами: ждать суток
   *  значило бы не проверять задачу вовсе.
   *
   *  Четыре запроса, каждый идемпотентен по построению: условие смотрит на то, что
   *  запрос и меняет, поэтому второй проход в тот же день не трогает ни одной строки. */
  async run(): Promise<CleanupOutcome> {
    const ipCleared = await this.prisma.$executeRawUnsafe(
      `UPDATE report
          SET created_ip = NULL
        WHERE created_ip IS NOT NULL
          AND created_at < now() - interval '${IP_RETENTION_DAYS} days'`,
    )

    // Время входа в терминальный статус берётся из истории: `updated_at` меняет любая
    // правка, а `done_at` есть только у DONE. CHECK `report_contacts_deleted_check`
    // не даст сохранить отметку вместе с непустыми контактами, поэтому рассогласование
    // «отметка есть, телефон остался» невозможно by construction (SRS §2.2).
    const contactsDeleted = await this.prisma.$executeRawUnsafe(
      `UPDATE report r
          SET contact_phone = NULL, contact_telegram = NULL, contacts_deleted_at = now()
        WHERE r.status IN ('DONE', 'REJECTED', 'DUPLICATE', 'OUT_OF_SCOPE')
          AND (r.contact_phone IS NOT NULL OR r.contact_telegram IS NOT NULL)
          AND (SELECT max(h.created_at)
                 FROM report_status_history h
                WHERE h.report_id = r.id AND h.to_status = r.status AND h.undone_at IS NULL)
              < now() - interval '${CONTACTS_RETENTION_DAYS} days'`,
    )

    const processedUpdates = await this.prisma.$executeRawUnsafe(
      `DELETE FROM processed_update WHERE created_at < now() - interval '${PROCESSED_UPDATE_RETENTION_DAYS} days'`,
    )

    const botPrompts = await this.prisma.$executeRaw`DELETE FROM bot_prompt WHERE expires_at < now()`

    // `contacts_deleted` — обязательное событие SRS §10.2. Пишется всегда, а не только
    // когда что-то удалилось: отсутствие строки в логе не должно быть неотличимо
    // от невыполнившейся задачи.
    logEvent('info', 'contacts_deleted', { count: contactsDeleted })
    logEvent('info', 'cleanup_done', {
      count: ipCleared + contactsDeleted + processedUpdates + botPrompts,
    })

    return { ipCleared, contactsDeleted, processedUpdates, botPrompts }
  }
}
