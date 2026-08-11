import type { ReportPhotoView } from '@ravonroad/shared-types'
import { describe, expect, it } from 'vitest'
import { latestRepairedView } from './latest'

const photo = (kind: ReportPhotoView['kind']): ReportPhotoView => ({
  kind,
  url: `${kind}.jpg`,
  previewUrl: `${kind}-preview.jpg`,
})

describe('последний ремонт под плакатом', () => {
  it('берёт пару только целиком', () => {
    expect(latestRepairedView(5, [photo('BEFORE'), photo('AFTER')])?.pair).not.toBeNull()
    // Снимок «после» появляется позже снимка «до»: одна плита рядом с пустотой
    // читается как недогруженная страница.
    expect(latestRepairedView(5, [photo('BEFORE')])?.pair).toBeNull()
  })

  it('не занимает место, когда показывать нечего', () => {
    // Ровно это состояние на данных без фотографий и без закрытых за неделю заявок.
    expect(latestRepairedView(0, [])).toBeNull()
    // Прибавка есть, фотографий нет — остаётся строка прибавки, а не пустой блок.
    expect(latestRepairedView(7, [])).toEqual({ week: 7, pair: null })
  })
})
