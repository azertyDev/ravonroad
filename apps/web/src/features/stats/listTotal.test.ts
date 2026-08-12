import type { StatsResponse } from '@ravonroad/shared-types'
import { describe, expect, it } from 'vitest'
import { EMPTY_FILTERS } from '../../entities/report/api'
import { listTotal } from './listTotal'

const stats: StatsResponse = {
  done: 7,
  goal: 10000,
  doneLastWeek: 7,
  queued: 26,
  districts: 2,
  byStatus: { NEW: 26, ACCEPTED: 12, IN_PROGRESS: 0, DONE: 7, OUT_OF_SCOPE: 4 },
  byDistrict: { chilonzor: 41, yunusobod: 8 },
}

describe('число заявок в срезе', () => {
  it('складывает выбранные статусы', () => {
    expect(listTotal({ ...EMPTY_FILTERS, status: ['NEW', 'DONE'] }, stats)).toBe(33)
  })

  it('берёт район из разбивки, а незнакомый считает пустым', () => {
    expect(listTotal({ ...EMPTY_FILTERS, district: 'yunusobod' }, stats)).toBe(8)
    expect(listTotal({ ...EMPTY_FILTERS, district: 'sergeli' }, stats)).toBe(0)
  })

  it('молчит там, где разбивка ответа не знает', () => {
    // Пересечение осей: сколько новых именно в Юнусабаде, /api/stats не считает.
    expect(listTotal({ ...EMPTY_FILTERS, status: ['NEW'], district: 'yunusobod' }, stats)).toBeNull()
    expect(listTotal({ ...EMPTY_FILTERS, category: 'roadway_pothole' }, stats)).toBeNull()
    expect(listTotal({ ...EMPTY_FILTERS, from: '2026-08-01' }, stats)).toBeNull()
    expect(listTotal(EMPTY_FILTERS, stats)).toBeNull()
    expect(listTotal({ ...EMPTY_FILTERS, status: ['NEW'] }, undefined)).toBeNull()
  })
})
