import type { ReportPhotoView } from '@ravonroad/shared-types'

export interface LatestRepairedView {
  /** Прибавка за неделю. Ноль означает «строки нет», а не «напечатать +0». */
  week: number
  /** Пара «до / после». Без неё блок остаётся одной строкой прибавки. */
  pair: { before: ReportPhotoView; after: ReportPhotoView } | null
}

/** Что показывать под плакатом кампании (Desktop C › правая колонка).
 *
 *  Два правила, и оба про пустоту. Одна плита «до» рядом с пустотой читается как
 *  недогруженная страница, а не как заявка, у которой ещё нет снимка «после», —
 *  поэтому пара либо целая, либо её нет. А «+0 ta» на плакате кампании читается как
 *  поломка, а не как факт, — поэтому нулевая прибавка не печатается.
 *
 *  Отсюда `null`: показывать нечего, и место блок не занимает. Это ровно то состояние,
 *  в котором стоит сайт на данных без фотографий, поэтому оно вынесено из разметки
 *  и проверяется тестом. */
export function latestRepairedView(doneLastWeek: number, photos: ReportPhotoView[]): LatestRepairedView | null {
  const before = photos.find((photo) => photo.kind === 'BEFORE')
  const after = photos.find((photo) => photo.kind === 'AFTER')
  const pair = before === undefined || after === undefined ? null : { before, after }
  return doneLastWeek === 0 && pair === null ? null : { week: doneLastWeek, pair }
}
