import { describe, expect, it } from 'vitest'
import { ERROR_CODES, REPORT_STATUSES } from './index'
import type { ApiErrorBody } from './index'

describe('REPORT_STATUSES', () => {
  it('перечисляет семь статусов глоссария без повторов', () => {
    expect([...REPORT_STATUSES]).toEqual([
      'NEW',
      'ACCEPTED',
      'IN_PROGRESS',
      'DONE',
      'REJECTED',
      'DUPLICATE',
      'OUT_OF_SCOPE',
    ])
    expect(new Set(REPORT_STATUSES).size).toBe(REPORT_STATUSES.length)
  })
})

describe('ApiErrorBody', () => {
  it('разрешает details только при VALIDATION_FAILED', () => {
    const validation: ApiErrorBody = {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'photos are required',
        correlationId: '01J9F7K2W8N4Q3',
        details: [{ field: 'photos', code: 'PHOTOS_REQUIRED' }],
      },
    }
    const notFound: ApiErrorBody = {
      // @ts-expect-error details недопустим ни для одного кода, кроме VALIDATION_FAILED
      error: {
        code: 'NOT_FOUND',
        message: 'report not found',
        correlationId: '01J9F7K2W8N4Q3',
        details: [],
      },
    }
    expect(validation.error.details).toHaveLength(1)
    expect(notFound.error.code).toBe('NOT_FOUND')
  })

  it('перечисляет коды, которые умеет вернуть каркас', () => {
    expect([...ERROR_CODES]).toEqual(['VALIDATION_FAILED', 'NOT_FOUND', 'INTERNAL_ERROR'])
  })
})
