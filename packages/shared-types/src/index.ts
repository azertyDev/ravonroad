/** Жизненный цикл заявки на ремонт ямы. */
export const REQUEST_STATUSES = [
  'NEW',
  'ACCEPTED',
  'IN_PROGRESS',
  'DONE',
  'REJECTED',
  'DUPLICATE',
  'OUT_OF_SCOPE',
] as const

export type RequestStatus = (typeof REQUEST_STATUSES)[number]
