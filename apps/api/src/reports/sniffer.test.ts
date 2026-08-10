import { describe, expect, it } from 'vitest'
import { sniffImageType } from './sniffer'

function bytes(...values: number[]): Buffer {
  return Buffer.from([...values, ...Array<number>(32).fill(0)])
}

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0)
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
])

describe('sniffImageType (SRS §5.3)', () => {
  it('принимает JPEG, PNG и WebP', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg')
    expect(sniffImageType(PNG)).toBe('image/png')
    expect(sniffImageType(WEBP)).toBe('image/webp')
  })

  it('отклоняет HEIC: сборка sharp без libheif его не декодирует', () => {
    // ftyp + бренд heic на смещении 4 — то, что придёт с айфона, если клиент
    // не справился с конвертацией.
    const heic = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0x00, 0x00, 0x00, 0x00,
    ])
    expect(sniffImageType(heic)).toBeNull()
  })

  it('отклоняет SVG: его рендер — исполнение чужой разметки', () => {
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull()
    expect(sniffImageType(Buffer.from('<?xml version="1.0"?><svg/>'))).toBeNull()
  })

  it('отклоняет PDF, ZIP и пустой файл', () => {
    expect(sniffImageType(Buffer.from('%PDF-1.7'))).toBeNull()
    expect(sniffImageType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull()
    expect(sniffImageType(Buffer.alloc(0))).toBeNull()
  })

  it('не принимает RIFF-контейнер, который не WebP', () => {
    // WAV начинается теми же четырьмя байтами; без проверки на смещении 8
    // он прошёл бы как картинка.
    const wav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    ])
    expect(sniffImageType(wav)).toBeNull()
  })

  it('не читает заявленный тип и расширение — только байты', () => {
    // Полиглот: заявляет себя картинкой, а начинается разметкой.
    expect(sniffImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull()
    // И наоборот: настоящий JPEG остаётся JPEG, как бы ни назывался файл.
    expect(sniffImageType(JPEG)).toBe('image/jpeg')
  })

  it('не падает на файле короче сигнатуры', () => {
    expect(sniffImageType(Buffer.from([0xff]))).toBeNull()
    expect(sniffImageType(Buffer.from([0xff, 0xd8]))).toBeNull()
    expect(sniffImageType(Buffer.from([0x52, 0x49, 0x46, 0x46]))).toBeNull()
  })
})
