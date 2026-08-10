/** Длинная сторона после уменьшения на устройстве (SRS §5.2, PRD §7.1).
 *  Столько же требует сервер, поэтому повторная работа в воркере сводится
 *  к перекодированию, а не к ресайзу. */
export const TARGET_LONG_SIDE = 1600

export interface Size {
  width: number
  height: number
}

/** Вписывает кадр в квадрат со стороной `max`, сохраняя пропорции.
 *
 *  Меньшие изображения **не увеличиваются**: растянутый кадр не добавляет ни пикселя
 *  информации, зато утяжеляет файл, за который житель платит мобильным трафиком.
 *
 *  Результат округляется вниз и никогда не обнуляется: холст нулевой ширины бросает
 *  исключение, а фотография 1×20000 — это не то, из-за чего форма должна ломаться. */
export function fitWithin(size: Size, max: number = TARGET_LONG_SIDE): Size {
  const longSide = Math.max(size.width, size.height)
  if (longSide <= max) return { width: size.width, height: size.height }

  const ratio = max / longSide
  return {
    width: Math.max(1, Math.floor(size.width * ratio)),
    height: Math.max(1, Math.floor(size.height * ratio)),
  }
}
