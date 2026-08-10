export * from './errors'
export * from './health'

/** Жизненный цикл заявки на ремонт ямы. Сущность называется Report: Request в NestJS
    занят HTTP-запросом (преамбула docs/srs.md). */
export const REPORT_STATUSES = [
  'NEW',
  'ACCEPTED',
  'IN_PROGRESS',
  'DONE',
  'REJECTED',
  'DUPLICATE',
  'OUT_OF_SCOPE',
] as const

export type ReportStatus = (typeof REPORT_STATUSES)[number]
