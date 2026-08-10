import type { ReportStatus } from '@ravonroad/shared-types'
import { STATUS_SHAPE, type StatusShape } from './statusShape'

const SHAPE: Record<StatusShape, React.ReactNode> = {
  ring: <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2" />,
  diamond: <path d="M8 2 14 8 8 14 2 8Z" fill="currentColor" />,
  hatch: (
    <>
      <rect x="2.5" y="2.5" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9 9 3M3 13 13 3M7 13 13 7" stroke="currentColor" strokeWidth="1.5" />
    </>
  ),
  check: <path d="M3 8.5 6.5 12 13 4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />,
  cross: <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />,
  'two-squares': (
    <>
      <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="6" y="6" width="8" height="8" fill="currentColor" />
    </>
  ),
  slash: <path d="M2.5 13.5 13.5 2.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />,
}

interface StatusMarkProps {
  status: ReportStatus
  /** Подпись для скринридера. Без неё значок остаётся декоративным и рядом обязан
   *  стоять текст статуса — цвет и форма сами по себе не читаются вслух. */
  label?: string
}

export function StatusMark({ status, label }: StatusMarkProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      role={label === undefined ? 'presentation' : 'img'}
      aria-label={label}
      aria-hidden={label === undefined}
      focusable="false"
    >
      {SHAPE[STATUS_SHAPE[status]]}
    </svg>
  )
}
