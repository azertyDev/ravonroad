import type { ReportStatus } from '@ravonroad/shared-types'

/** Статус различается не только цветом, но и формой (PRD §8.2): на чёрно-белой печати
 *  и при дейтеранопии цвета маркеров сближаются до неразличимости, форма — нет. */
export const STATUS_SHAPES = ['ring', 'diamond', 'hatch', 'check', 'cross', 'two-squares', 'slash'] as const

export type StatusShape = (typeof STATUS_SHAPES)[number]

export const STATUS_SHAPE: Record<ReportStatus, StatusShape> = {
  NEW: 'ring',
  ACCEPTED: 'diamond',
  IN_PROGRESS: 'hatch',
  DONE: 'check',
  REJECTED: 'cross',
  DUPLICATE: 'two-squares',
  OUT_OF_SCOPE: 'slash',
}
