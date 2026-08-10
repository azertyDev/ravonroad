import sharp from 'sharp'

/** Настоящий JPEG, а не четыре байта сигнатуры: те же данные проходят и приём,
 *  и воркер, поэтому тест очереди не приходится кормить отдельной подделкой. */
export function makeJpeg(width = 40, height = 30): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 90, g: 90, b: 90 } } })
    .jpeg()
    .toBuffer()
}

/** JPEG с EXIF, включая GPS: на нём проверяется, что сервер вырезает метаданные
 *  целиком, а не только видимые теги (SRS §9.6, PRD §7.1). */
export function makeJpegWithExif(width = 2400, height = 1800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 40, b: 40 } } })
    .withExifMerge({
      IFD0: { Make: 'RavonRoad', Model: 'TestCam' },
      GPS: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
    })
    .jpeg()
    .toBuffer()
}

export function photoPart(bytes: Buffer, name = 'photo.jpg', type = 'image/jpeg'): [string, Blob, string] {
  return ['photos', new Blob([new Uint8Array(bytes)], { type }), name]
}
