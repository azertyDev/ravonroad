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

/** Кусок имени токена цвета: `--status-<slug>-tint|ink|line|pin`. Совпадать с именем
 *  статуса он не обязан и не совпадает — палитра сокращает два самых длинных. */
export const STATUS_SLUG: Record<ReportStatus, string> = {
  NEW: 'new',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'progress',
  DONE: 'done',
  REJECTED: 'rejected',
  DUPLICATE: 'duplicate',
  OUT_OF_SCOPE: 'outofscope',
}

/** Внутренние статусы: на публичной карте их нет вовсе, а там, где они всё-таки видны
 *  (страница заявки), дизайн-система помечает их приёмом, а не только цветом —
 *  пунктирной обводкой. Смысл пометки: «этого нет на публичной карте». */
export const INTERNAL_STATUSES: ReadonlySet<ReportStatus> = new Set<ReportStatus>([
  'REJECTED',
  'DUPLICATE',
  'OUT_OF_SCOPE',
])
