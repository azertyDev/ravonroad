import { Injectable } from '@nestjs/common'
import type { Prisma } from '../generated/prisma/client'
import type { InlineKeyboardButton } from './bot-api.client'
import { encodeCallbackData } from './callback-data'
import { displayNumber } from './card.renderer'
import { BUTTONS } from './labels'

/** Кластеры дублей (SRS §6.14, §3.2).
 *
 *  Одна яма, снятая двадцатью подписчиками, при всплеске порождает двадцать заявок.
 *  `duplicate_candidate_of_id` связывает их звездой ещё при создании, и бот отправляет
 *  по кластеру **одну** карточку: фотографии корня, список номеров и три кнопки.
 *
 *  Гипотеза системы никогда не становится решением сама: без нажатия модератора
 *  `duplicate_candidate_of_id` не влияет ни на статус, ни на видимость заявки,
 *  ни на счётчик. */

/** Кластер имеет смысл при двух и более спутниках: на одном спутнике «одна карточка
 *  вместо двух» экономит одно сообщение и стоит модератору лишнего шага «раскрыть». */
const MIN_MEMBERS = 2

export interface ClusterMember {
  outbox_id: bigint
  report_id: number
  public_number: number
}

@Injectable()
export class DuplicatesService {
  /** Спутники корня, чья карточка ещё не ушла. Только `NEW`: заявку, по которой уже есть
   *  решение, кластер не трогает. */
  members(tx: Prisma.TransactionClient, rootId: number): Promise<ClusterMember[]> {
    return tx.$queryRaw<ClusterMember[]>`
      SELECT o.id AS outbox_id, r.id AS report_id, r.public_number
        FROM report r
        JOIN telegram_outbox o ON o.report_id = r.id AND o.kind = 'CARD_CREATE' AND o.sent_at IS NULL
       WHERE r.duplicate_candidate_of_id = ${rootId} AND r.status = 'NEW'
       ORDER BY r.created_at
         FOR UPDATE OF o SKIP LOCKED`
  }

  isCluster(members: ClusterMember[]): boolean {
    return members.length >= MIN_MEMBERS
  }

  /** Состав фиксируется массивом; первый элемент — корень. Отдельной колонки под корень
   *  нет: у пакета-кластера он всегда один и всегда первый, а вторая колонка означала бы
   *  два источника истины о том же. */
  async createBatch(
    tx: Prisma.TransactionClient,
    rootId: number,
    memberIds: number[],
    chatId: string,
  ): Promise<number> {
    const batch = await tx.moderationBatch.create({
      data: { kind: 'DUPLICATE_CLUSTER', reportIds: [rootId, ...memberIds], chatId: BigInt(chatId) },
      select: { id: true },
    })
    return batch.id
  }

  /** Кнопки кластера добавляются к обычным кнопкам корня: решение по самому корню
   *  никуда не девается от того, что рядом нашлись похожие заявки.
   *
   *  «Все дубли» — тот же переход T-04/T-09, применённый к списку: обязательное поле
   *  «номер оригинала» уже известно, поэтому второго шага не требуется. */
  keyboard(batchId: number, rootNumber: number, memberCount: number): InlineKeyboardButton[][] {
    return [
      [
        {
          text: BUTTONS.allDuplicates(displayNumber(rootNumber), memberCount),
          callback_data: encodeCallbackData({ op: 'B', n: batchId, arg: 'D' }),
        },
      ],
      [
        { text: BUTTONS.differentPotholes, callback_data: encodeCallbackData({ op: 'B', n: batchId, arg: 'X' }) },
        { text: BUTTONS.expand, callback_data: encodeCallbackData({ op: 'b', n: batchId }) },
      ],
    ]
  }
}
