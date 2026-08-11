import { describe, expect, it } from 'vitest'
import { countFilters, isEmptyFilters, toFilters, toSearch, validateReportSearch } from './searchParams'

describe('фильтры в адресе', () => {
  it('переживает круг «URL → фильтры → URL»', () => {
    const search = { status: 'ACCEPTED,IN_PROGRESS', district: 'chilonzor', from: '2026-08-01', dateField: 'done' }

    expect(toSearch(toFilters(validateReportSearch(search)))).toEqual(search)
  })

  it('отбрасывает мусор, а не роняет страницу', () => {
    const search = validateReportSearch({
      status: 'ACCEPTED,ПРИВЕТ,REJECTED',
      district: '   ',
      from: '01.08.2026',
      to: '2026-13-45',
      dateField: 'whenever',
      unknown: 'ignored',
    })

    // REJECTED отбрасывается вместе с мусором: этих заявок нет ни в списке,
    // ни на карте, и ошибкой запрос не считается (SRS §4.3).
    expect(search).toEqual({ status: 'ACCEPTED' })
  })

  it('узнаёт пустой набор — по нему список решает, показывать ли кнопку сброса', () => {
    expect(isEmptyFilters(toFilters(validateReportSearch({})))).toBe(true)
    expect(isEmptyFilters(toFilters(validateReportSearch({ district: 'yunusobod' })))).toBe(false)
  })

  it('берёт прицел карты только парой координат', () => {
    expect(validateReportSearch({ lat: '41.31', lon: '69.28' })).toEqual({ lat: 41.31, lon: 69.28 })
    expect(validateReportSearch({ lat: '41.31' })).toEqual({})
    expect(validateReportSearch({ lat: 'сюда', lon: '69.28' })).toEqual({})
    // Прицел — не фильтр: в набор заявок он не входит и на кнопке «Фильтры» не считается.
    expect(countFilters(toFilters(validateReportSearch({ lat: 41.31, lon: 69.28 })))).toBe(0)
  })

  it('считает каждый статус отдельно — их и снимают по одному', () => {
    expect(countFilters(toFilters(validateReportSearch({})))).toBe(0)
    // Поле даты в счёт не идёт: без самих дат оно ничего не отбирает.
    expect(countFilters(toFilters(validateReportSearch({ dateField: 'done' })))).toBe(0)
    expect(
      countFilters(toFilters(validateReportSearch({ status: 'NEW,DONE', district: 'chilonzor', from: '2026-08-01' }))),
    ).toBe(4)
  })
})
