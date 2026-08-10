import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Prisma } from '../generated/prisma/client'
import { OUT_OF_SCOPE_REASONS, REJECT_REASONS } from '../reports/transitions'
import type { InlineKeyboardButton, SendMessageParams } from './bot-api.client'
import { encodeCallbackData } from './callback-data'
import { REASON_LABELS, displayNumber, escapeHtml } from './card.renderer'

/** Digest-режим (SRS §6.13).
 *
 *  Поштучные карточки упираются в бюджет канала при ~600 заявках в час, а группа
 *  из пятнадцати человек при 1000 карточек в час перестаёт читаться как рабочий чат.
 *  Это арифметика, а не тюнинг: карточка — два сообщения, бюджет — двадцать в минуту.
 *
 *  Digest — `sendMessage` со списком, без фотографий: десять альбомов это снова десять
 *  сообщений, то есть ровно та проблема, от которой уходим. Фотографии открываются
 *  по ссылке на публичную карточку. */

/** Очередь длиннее — переключаемся. Порог выбран так, чтобы очередь очищалась поштучно
 *  примерно за три минуты бюджета (SRS §6.13). Проектный ориентир, пересматривается
 *  после первого всплеска. */
export const DIGEST_THRESHOLD = 30

/** Заявок в одном digest-сообщении. */
export const DIGEST_SIZE = 10

export interface DigestReport {
  report_id: number
  public_number: number
  district: string
  category: string
  landmark: string | null
}

@Injectable()
export class DigestService {
  private readonly webOrigin: string

  constructor(private readonly config: ConfigService) {
    this.webOrigin = this.config.getOrThrow<string>('WEB_ORIGIN').replace(/\/+$/, '')
  }

  /** Состав пакета фиксируется здесь и больше не пересчитывается: иначе модератор
   *  нажимал бы «принять все» на один список, а применялось бы к другому, изменившемуся
   *  за минуту (SRS §2.15). */
  async createBatch(
    tx: Prisma.TransactionClient,
    reportIds: number[],
    chatId: string,
  ): Promise<{ id: number; params: SendMessageParams }> {
    const batch = await tx.moderationBatch.create({
      data: { kind: 'DIGEST', reportIds, chatId: BigInt(chatId) },
      select: { id: true },
    })

    const reports = await tx.$queryRaw<DigestReport[]>`
      SELECT r.id AS report_id, r.public_number, d.name_ru AS district,
             c.name_ru AS category, r.landmark
        FROM report r
        JOIN district d ON d.code = r.district_code
        JOIN category c ON c.id = r.category_id
       WHERE r.id = ANY(${reportIds})
       ORDER BY r.created_at`

    return { id: batch.id, params: this.message(batch.id, reports, chatId) }
  }

  private message(batchId: number, reports: DigestReport[], chatId: string): SendMessageParams {
    const lines = [`<b>Новых заявок: ${reports.length}</b>`]
    for (const report of reports) {
      const landmark = report.landmark === null ? '' : ` · «${escapeHtml(report.landmark)}»`
      lines.push(
        `<a href="${this.webOrigin}/uz/reports/${report.public_number}">${displayNumber(report.public_number)}</a>` +
          ` · ${escapeHtml(report.district)} · ${escapeHtml(report.category)}${landmark}`,
      )
    }

    return {
      chat_id: chatId,
      text: lines.join('\n'),
      parse_mode: 'HTML',
      // Превью первой ссылки развернуло бы сообщение на весь экран — при десяти строках
      // это уже не сводка.
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: this.keyboard(batchId) },
    }
  }

  keyboard(batchId: number): InlineKeyboardButton[][] {
    return [
      [
        { text: 'Принять все', callback_data: encodeCallbackData({ op: 'B', n: batchId, arg: 'AC' }) },
        { text: 'Отклонить все', callback_data: encodeCallbackData({ op: 'B', n: batchId, arg: 'RJ' }) },
      ],
      [{ text: 'Раскрыть', callback_data: encodeCallbackData({ op: 'b', n: batchId }) }],
    ]
  }

  /** Второй шаг для «Отклонить все»: причина обязательна и для пакета — PRD §5.2
   *  не делает исключения для количества (SRS §6.5). */
  reasonKeyboard(batchId: number, target: 'REJECTED' | 'OUT_OF_SCOPE'): InlineKeyboardButton[][] {
    const codes = (target === 'REJECTED' ? REJECT_REASONS : OUT_OF_SCOPE_REASONS).filter(
      // «Другое» требует текста от модератора, а текст — это ForceReply на пакет,
      // то есть ещё одно сообщение в группе на каждое нажатие. В пакете его нет.
      (code) => code !== 'other',
    )
    return codes.map((code) => [
      {
        text: REASON_LABELS[code] ?? code,
        callback_data: encodeCallbackData({ op: 'B', n: batchId, arg: `R-${code}` }),
      },
    ])
  }
}
