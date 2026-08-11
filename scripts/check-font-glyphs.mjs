// Проверяет покрытие глифов в СКАЧАННЫХ файлах, а не в объявлении unicode-range.
// Именно так вскрылось отсутствие U+2009 в IBM Plex Mono при заявленном U+2000-206F.
import { readFileSync, readdirSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'

const WANT = {
  0x02bb: 'ʻ U+02BB — Oʻ, Gʻ',
  0x02bc: 'ʼ U+02BC — tutuq belgisi',
  0x2009: 'тонкий пробел U+2009',
  0x00a0: 'неразрывный пробел U+00A0',
  0x0410: 'А U+0410',
  0x044f: 'я U+044F',
  0x2116: '№ U+2116',
  0x00b7: '· U+00B7',
}

const TAGS = ['cmap','head','hhea','hmtx','maxp','name','OS/2','post','cvt ','fpgm','glyf','loca','prep','CFF ','VORG','EBDT','EBLC','gasp','hdmx','kern','LTSH','PCLT','VDMX','vhea','vmtx','BASE','GDEF','GPOS','GSUB','EBSC','JSTF','MATH','CBDT','CBLC','COLR','CPAL','SVG ','sbix','acnt','avar','bdat','bloc','bsln','cvar','fdsc','feat','fmtx','fvar','gvar','hsty','just','lcar','mort','morx','opbd','prop','trak','Zapf','Silf','Glat','Gloc','Feat','Sill']

function readBase128(buf, offset) {
  let value = 0
  for (let i = 0; i < 5; i += 1) {
    const byte = buf[offset + i]
    value = (value << 7) | (byte & 0x7f)
    if ((byte & 0x80) === 0) return [value >>> 0, offset + i + 1]
  }
  throw new Error('base128 too long')
}

function woff2Tables(buf) {
  if (buf.toString('ascii', 0, 4) !== 'wOF2') throw new Error('not woff2')
  const numTables = buf.readUInt16BE(12)
  let p = 48
  const dir = []
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[p]
    p += 1
    let tag
    if ((flags & 0x3f) === 0x3f) {
      tag = buf.toString('ascii', p, p + 4)
      p += 4
    } else {
      tag = TAGS[flags & 0x3f]
    }
    let length
    ;[length, p] = readBase128(buf, p)
    const transform = (flags >> 6) & 0x03
    let transformed = length
    if ((tag === 'glyf' || tag === 'loca') && transform === 0) {
      ;[transformed, p] = readBase128(buf, p)
    } else if (tag !== 'glyf' && tag !== 'loca' && transform !== 0) {
      ;[transformed, p] = readBase128(buf, p)
    }
    dir.push({ tag, length: transformed })
  }
  const data = brotliDecompressSync(buf.subarray(p))
  const tables = {}
  let offset = 0
  for (const entry of dir) {
    tables[entry.tag] = data.subarray(offset, offset + entry.length)
    offset += entry.length
  }
  return tables
}

function cmapCodepoints(cmap) {
  const found = new Set()
  const numTables = cmap.readUInt16BE(2)
  for (let i = 0; i < numTables; i += 1) {
    const offset = cmap.readUInt32BE(8 + i * 8)
    const sub = cmap.subarray(offset)
    const format = sub.readUInt16BE(0)
    if (format === 4) {
      const segX2 = sub.readUInt16BE(6)
      const ends = 14
      const starts = ends + segX2 + 2
      for (let s = 0; s < segX2 / 2; s += 1) {
        const end = sub.readUInt16BE(ends + s * 2)
        const start = sub.readUInt16BE(starts + s * 2)
        if (start === 0xffff) continue
        for (let c = start; c <= end && c - start < 20000; c += 1) found.add(c)
      }
    } else if (format === 12) {
      const groups = sub.readUInt32BE(12)
      for (let g = 0; g < groups; g += 1) {
        const base = 16 + g * 12
        const start = sub.readUInt32BE(base)
        const end = sub.readUInt32BE(base + 4)
        for (let c = start; c <= end && c - start < 20000; c += 1) found.add(c)
      }
    }
  }
  return found
}

const dir = process.argv[2]
const all = new Set()
for (const file of readdirSync(dir).filter((f) => f.endsWith('.woff2'))) {
  const tables = woff2Tables(readFileSync(`${dir}/${file}`))
  const codes = cmapCodepoints(tables['cmap'])
  console.log(`${file}: ${codes.size} кодовых точек`)
  for (const c of codes) all.add(c)
}

console.log(`\nвсего: ${all.size}`)
let bad = 0
for (const [code, label] of Object.entries(WANT)) {
  const ok = all.has(Number(code))
  if (!ok) bad += 1
  console.log(`  ${ok ? 'есть' : 'НЕТ '}  ${label}`)
}
process.exit(bad === 0 ? 0 : 1)
