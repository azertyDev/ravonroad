import { Injectable } from '@nestjs/common'
import type { ReportStatus } from '@ravonroad/shared-types'
import { S3Service } from '../media/s3.service'
import { PrismaService } from '../prisma/prisma.service'
import { OUT_OF_SCOPE_REASONS, REJECT_REASONS, isTerminal, transitionsFrom } from '../reports/transitions'
import { UndoService } from '../reports/undo.service'
import type { InlineKeyboardButton } from './bot-api.client'
import { encodeCallbackData } from './callback-data'

/** Карточка заявки в группе (SRS §6.3, §6.4).
 *
 *  Два сообщения, а не одно: медиагруппа не может нести inline-клавиатуру. Два, а не три:
 *  ссылка на Яндекс Карты в подписи открывает приложение с тем же результатом, что
 *  `sendLocation`, и не добавляет группе третьего уведомления (US-027).
 *
 *  Ни телефона, ни ника заявителя в карточке нет и быть не может: её видит вся группа,
 *  а контакты не публикуются нигде (PRD §6.2, §9.2). Они здесь просто не выбираются
 *  из БД — не «фильтруются при рендере», а не приходят вовсе. */

/** Лимит подписи к медиагруппе. Ориентир: `landmark` ≤ 200, остальное служебное. */
const CAPTION_LIMIT = 1024

/** Столько номеров показываем в строке «рядом»: дальше строка перестаёт читаться
 *  с телефона, а решение всё равно принимается по фотографиям (SRS §6.3). */
const NEARBY_LIMIT = 3

export const STATUS_LABELS: Record<ReportStatus, string> = {
  NEW: 'Новая',
  ACCEPTED: 'Принята',
  IN_PROGRESS: 'В работе',
  DONE: 'Отремонтирована',
  REJECTED: 'Отклонена',
  DUPLICATE: 'Дубликат',
  OUT_OF_SCOPE: 'Не по силам',
}

export const REASON_LABELS: Record<string, string> = {
  not_road_defect: 'Не дефект покрытия',
  unreadable_photo: 'Фото непригодно',
  spam: 'Спам',
  ground_sinkhole: 'Провал грунта',
  utilities: 'Коммуникации',
  highway: 'Магистраль',
  too_large: 'Объём выше сил',
  other: 'Другое',
}

const ABUSE_LABELS: Record<string, string> = {
  HONEYPOT: 'скрытое поле заполнено',
  FAST_FILL: 'форма заполнена слишком быстро',
  IP_RATE: 'много заявок с одного адреса',
}

/** Кнопки статусов несут целевой статус, а не действие: «Принять» из `NEW` и «Вернуть
 *  в очередь» из `IN_PROGRESS` ведут в один и тот же `ACCEPTED` (SRS §6.4). Какой это
 *  переход, сервер выясняет по текущему статусу — из таблицы, а не из кнопки. */
const STATUS_ARGS: Record<string, ReportStatus> = { AC: 'ACCEPTED', IP: 'IN_PROGRESS' }

export function statusFromArg(arg: string | undefined): ReportStatus | null {
  return (arg === undefined ? null : STATUS_ARGS[arg]) ?? null
}

const BUTTON_LABELS: Record<string, string> = {
  'NEW:ACCEPTED': 'Принять',
  'ACCEPTED:IN_PROGRESS': 'В работу',
  'IN_PROGRESS:ACCEPTED': 'Вернуть в очередь',
}

export interface CardSnapshot {
  id: number
  publicNumber: number
  status: ReportStatus
  landmark: string | null
  latitude: string
  longitude: string
  createdAt: Date
  districtName: string
  categoryName: string
  photoUrls: string[]
  abuseRules: string[]
  nearbyNumbers: number[]
  statusReason: string | null
  statusReasonText: string | null
  publicationUrl: string | null
  duplicateOfNumber: number | null
  afterPhotoCount: number
  /** Сообщение альбома — якорь, на который отвечают фотографиями «после» (SRS §6.8). */
  albumMessageId: number | null
  /** Сообщение с кнопками — то, которое редактируется при каждом переходе. */
  cardMessageId: number | null
  lastHistory: {
    id: number
    toStatus: ReportStatus
    createdAt: Date
    undoneAt: Date | null
    moderatorName: string | null
  } | null
}

export function displayNumber(publicNumber: number): string {
  return `RR-${publicNumber}`
}

/** Экранирование обязательно, а не желательно: `landmark` пишет житель, а `parse_mode`
 *  у нас HTML. Незакрытый `<b>` от жителя ломает всю карточку, а `<a href>` — превращает
 *  её в ссылку на что угодно. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Ташкентское время: бригада читает карточку в своём часовом поясе, а сервер живёт
 *  в UTC. Формат короткий — дата и часы, секунды в решении не участвуют. */
const MOMENT = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Asia/Tashkent',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatMoment(value: Date): string {
  return MOMENT.format(value)
}

export function mapLink(latitude: string, longitude: string): string {
  return `https://yandex.uz/maps/?pt=${longitude},${latitude}&z=18&l=map`
}

@Injectable()
export class CardRenderer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly undo: UndoService,
  ) {}

  /** Всё, что нужно карточке, одним чтением. Читается в момент отправки, а не в момент
   *  постановки в очередь: схлопнутая правка обязана уйти с актуальным состоянием,
   *  а отложенная на 15 минут — уже без кнопки отмены (SRS §6.6, §6.10). */
  async load(reportId: number): Promise<CardSnapshot | null> {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        publicNumber: true,
        status: true,
        landmark: true,
        latitude: true,
        longitude: true,
        createdAt: true,
        statusReason: true,
        statusReasonText: true,
        publicationUrl: true,
        duplicateCandidateOfId: true,
        telegramAlbumMessageId: true,
        telegramCardMessageId: true,
        duplicateOf: { select: { publicNumber: true } },
        district: { select: { nameRu: true } },
        category: { select: { nameRu: true } },
        photos: {
          where: { kind: 'BEFORE', state: 'READY' },
          orderBy: { sortOrder: 'asc' },
          select: { objectKey: true },
        },
        abuseSignals: { select: { rule: true } },
        duplicateCandidates: { select: { publicNumber: true }, take: NEARBY_LIMIT },
        history: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: {
          id: true,
          toStatus: true,
          createdAt: true,
          undoneAt: true,
          moderator: { select: { displayName: true } },
        } },
        _count: { select: { photos: { where: { kind: 'AFTER' } } } },
      },
    })
    if (report === null) return null

    const last = report.history[0]
    return {
      id: report.id,
      publicNumber: report.publicNumber,
      status: report.status,
      landmark: report.landmark,
      latitude: report.latitude.toFixed(6),
      longitude: report.longitude.toFixed(6),
      createdAt: report.createdAt,
      districtName: report.district.nameRu,
      categoryName: report.category.nameRu,
      photoUrls: report.photos.flatMap((photo) => (photo.objectKey === null ? [] : [this.s3.publicUrl(photo.objectKey)])),
      abuseRules: report.abuseSignals.map((signal) => signal.rule),
      nearbyNumbers: report.duplicateCandidates.map((candidate) => candidate.publicNumber),
      statusReason: report.statusReason,
      statusReasonText: report.statusReasonText,
      publicationUrl: report.publicationUrl,
      duplicateOfNumber: report.duplicateOf?.publicNumber ?? null,
      afterPhotoCount: report._count.photos,
      albumMessageId: report.telegramAlbumMessageId,
      cardMessageId: report.telegramCardMessageId,
      lastHistory:
        last === undefined
          ? null
          : {
              id: last.id,
              toStatus: last.toStatus,
              createdAt: last.createdAt,
              undoneAt: last.undoneAt,
              moderatorName: last.moderator?.displayName ?? null,
            },
    }
  }

  /** То же по публичному номеру: в `callback_data` лежит именно он (SRS §6.4). */
  async loadByNumber(publicNumber: number): Promise<CardSnapshot | null> {
    const report = await this.prisma.report.findUnique({ where: { publicNumber }, select: { id: true } })
    return report === null ? null : this.load(report.id)
  }

  /** Подпись на первом фото альбома (SRS §6.3). */
  caption(card: CardSnapshot): string {
    const lines = [
      `<b><code>${displayNumber(card.publicNumber)}</code></b> · ${escapeHtml(card.districtName)}`,
      escapeHtml(card.categoryName),
    ]
    if (card.landmark !== null) lines.push(`«${escapeHtml(card.landmark)}»`)
    lines.push(formatMoment(card.createdAt))
    lines.push(`<a href="${mapLink(card.latitude, card.longitude)}">Открыть на карте</a>`)
    if (card.abuseRules.length > 0) {
      const rules = card.abuseRules.map((rule) => ABUSE_LABELS[rule] ?? rule).join(', ')
      lines.push(`⚠️ проверить: ${rules}`)
    }
    if (card.nearbyNumbers.length > 0) {
      lines.push(`рядом: ${card.nearbyNumbers.slice(0, NEARBY_LIMIT).map(displayNumber).join(', ')}`)
    }

    const caption = lines.join('\n')
    // Обрезается целиком, а не по строкам: терять хвост осмысленнее, чем отправить
    // сообщение, которое Telegram отвергнет, и уронить карточку в повторы.
    return caption.length <= CAPTION_LIMIT ? caption : `${caption.slice(0, CAPTION_LIMIT - 1)}…`
  }

  /** Текст сообщения с кнопками — то самое, что редактируется при каждом переходе. */
  statusText(card: CardSnapshot): string {
    const lines = [`<b><code>${displayNumber(card.publicNumber)}</code></b> — ${STATUS_LABELS[card.status]}`]

    if (card.statusReason !== null) {
      const label = REASON_LABELS[card.statusReason] ?? card.statusReason
      lines.push(
        card.statusReasonText === null ? label : `${label}: ${escapeHtml(card.statusReasonText)}`,
      )
    }
    if (card.duplicateOfNumber !== null) lines.push(`оригинал: ${displayNumber(card.duplicateOfNumber)}`)
    if (card.publicationUrl !== null) lines.push(`публикация: ${escapeHtml(card.publicationUrl)}`)

    const last = card.lastHistory
    if (last !== null && card.status !== 'NEW') {
      // Имя внутри группы не тайна; публично оно не показывается никогда (PRD §6.2).
      const who = last.moderatorName ?? 'волонтёр'
      lines.push(`${who}, ${formatMoment(last.createdAt)}`)
    }
    return lines.join('\n')
  }

  /** Клавиатура строится из таблицы переходов, а не из собственного списка условий:
   *  кнопка существует ровно тогда, когда существует переход (SRS §6.4).
   *
   *  Кнопки `DONE` нет ни при каком статусе — и это не забывчивость: `DONE` наступает
   *  только от фотографии «после» (BR-006), поэтому кнопки для него не существует. */
  keyboard(card: CardSnapshot, now = Date.now()): InlineKeyboardButton[][] {
    if (isTerminal(card.status)) {
      const last = card.lastHistory
      if (last === null || !this.undo.canUndo(last, now)) return []
      return [[{ text: '↩︎ Отменить', callback_data: encodeCallbackData({ op: 'u', n: last.id }) }]]
    }

    const rows: InlineKeyboardButton[][] = []
    const first: InlineKeyboardButton[] = []
    for (const transition of transitionsFrom(card.status)) {
      if (transition.actor === 'VOLUNTEER') continue
      const arg = Object.keys(STATUS_ARGS).find((key) => STATUS_ARGS[key] === transition.to)
      if (transition.to === 'REJECTED') {
        first.push({ text: 'Отклонить', callback_data: encodeCallbackData({ op: 'r', n: card.publicNumber }) })
        continue
      }
      if (transition.to === 'DUPLICATE') {
        first.push({ text: 'Дубль', callback_data: encodeCallbackData({ op: 'd', n: card.publicNumber }) })
        continue
      }
      if (transition.to === 'OUT_OF_SCOPE') {
        first.push({ text: 'Не по силам', callback_data: encodeCallbackData({ op: 'o', n: card.publicNumber }) })
        continue
      }
      if (arg === undefined) continue
      rows.push([
        {
          text: BUTTON_LABELS[`${transition.from}:${transition.to}`] ?? STATUS_LABELS[transition.to],
          callback_data: encodeCallbackData({ op: 's', n: card.publicNumber, arg }),
        },
      ])
    }
    // Первым рядом — переход вперёд, вторым и третьим — отказы: попасть пальцем
    // в «Отклонить» вместо «Принять» не должно быть так же легко, как в соседнюю кнопку.
    if (first.length > 0) rows.push(first.slice(0, 2), first.slice(2))
    return rows.filter((row) => row.length > 0)
  }

  /** Второй шаг двухшагового перехода: кнопки причин вместо кнопок статусов в том же
   *  сообщении (SRS §6.5). Новых сообщений в группе не появляется. */
  reasonKeyboard(publicNumber: number, target: 'REJECTED' | 'OUT_OF_SCOPE'): InlineKeyboardButton[][] {
    const codes = target === 'REJECTED' ? REJECT_REASONS : OUT_OF_SCOPE_REASONS
    const op = target === 'REJECTED' ? 'R' : 'O'
    const rows: InlineKeyboardButton[][] = codes.map((code) => [
      { text: REASON_LABELS[code] ?? code, callback_data: encodeCallbackData({ op, n: publicNumber, arg: code }) },
    ])
    rows.push([{ text: '← Назад', callback_data: encodeCallbackData({ op: 'z', n: publicNumber }) }])
    return rows
  }
}
