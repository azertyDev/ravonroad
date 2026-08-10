import { STATUS_SHAPE, type StatusShape } from '../../shared/ui/status/statusShape'

/** Что видно на публичной карте (PRD §6.1).
 *
 *  `REJECTED` и `DUPLICATE` в списке отсутствуют: они скрыты и с карты, и из списка,
 *  а по прямой ссылке отвечают `404` — скрывается не только тело заявки, но и сам факт
 *  её существования (SRS §9.2). `OUT_OF_SCOPE` здесь есть намеренно: реестр «не по силам»
 *  публикуется (BRD §7), и самая дешёвая форма публикации — та же карта.
 *
 *  Порядок этого списка ни на что не влияет: индекс статуса точка получает от сервера,
 *  который присылает свой массив `statuses` рядом с точками (SRS §4.4). Совпадать они
 *  не обязаны — клиент читает индекс по присланному массиву, а не по этому. */
export const MAP_STATUSES = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'DONE', 'OUT_OF_SCOPE'] as const

export type MapStatus = (typeof MAP_STATUSES)[number]

/** Принимает `string`, а не `ReportStatus`: статус приходит и из свойств кластера,
 *  где типов нет вовсе, и из ответа сервера, который бывает новее клиента. */
export function isMapStatus(value: string): value is MapStatus {
  return (MAP_STATUSES as readonly string[]).includes(value)
}

/** Пин на карте: форма и цвет.
 *
 *  Форма — из общей таблицы статусов (`shared/ui/status`), одна на карту, список
 *  и карточку: значок рядом со словом «Выполнено» и пин на карте обязаны читаться как
 *  одно и то же. Цвет — переменная, а не число: пин собирается элементом DOM, где
 *  `var()` резолвится живым и переживает смену темы (`colors.css`).
 *
 *  Различаются пины и без цвета: `DONE` — галочка, `OUT_OF_SCOPE` — косая черта,
 *  рабочие статусы — кольцо, ромб и штриховка (PRD §6.1, §8.2). При дейтеранопии
 *  пары цветов сближаются до ΔE 12.5, формы — нет. */
export interface MarkerLook {
  shape: StatusShape
  color: string
}

export const MARKER_LOOK: Record<MapStatus, MarkerLook> = {
  NEW: { shape: STATUS_SHAPE.NEW, color: 'var(--status-new-pin)' },
  ACCEPTED: { shape: STATUS_SHAPE.ACCEPTED, color: 'var(--status-accepted-pin)' },
  IN_PROGRESS: { shape: STATUS_SHAPE.IN_PROGRESS, color: 'var(--status-progress-pin)' },
  DONE: { shape: STATUS_SHAPE.DONE, color: 'var(--status-done-pin)' },
  OUT_OF_SCOPE: { shape: STATUS_SHAPE.OUT_OF_SCOPE, color: 'var(--status-outofscope-pin)' },
}
