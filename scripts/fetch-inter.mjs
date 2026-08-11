// Скачивает подмножества Inter с Google Fonts в public/fonts и собирает fonts.css.
// Google Fonts подключением не пользуемся: аудитория на мобильном интернете, а сторонний
// CDN добавляет DNS и TLS к первому экрану и ломает офлайн целиком. CSP сайта тоже
// разрешает только собственный origin.
import { writeFileSync } from 'node:fs'

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const OUT = process.argv[2]
const FAMILY = 'Inter:wght@400..900'

const css = await (
  await fetch(`https://fonts.googleapis.com/css2?family=${FAMILY}&display=swap`, {
    headers: { 'User-Agent': UA },
  })
).text()

// Блоки идут как «/* subset */ @font-face { … }» — разбираем по комментарию с именем.
const blocks = css.split('/*').slice(1)
const faces = []

for (const block of blocks) {
  const subset = block.slice(0, block.indexOf('*/')).trim()
  const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1]
  const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]?.trim()
  const weight = block.match(/font-weight:\s*([^;]+);/)?.[1]?.trim()
  if (url === undefined || range === undefined) continue
  // Греческий и вьетнамский не нужны: интерфейс на узбекском и русском.
  if (!/^(latin|latin-ext|cyrillic|cyrillic-ext)$/.test(subset)) continue

  const name = `inter-${(weight ?? '400').replace(/\s+/g, '-')}-${subset}.woff2`
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer())
  writeFileSync(`${OUT}/${name}`, bytes)
  faces.push({ name, range, weight: weight ?? '400', bytes: bytes.length, subset })
  console.log(`${name}  ${(bytes.length / 1024).toFixed(1)} КБ`)
}

const header = `/* Inter, переменная насыщенность 400–900. Файлы локальные: сторонний CDN добавил бы
   DNS и TLS к первому экрану, а офлайн ломал бы шрифт целиком; CSP сайта разрешает
   только собственный origin.

   Гарнитура выбрана по покрытию, а не по вкусу: она обязана содержать кириллицу И
   модификаторные буквы U+02BB (ʻ) и U+02BC (ʼ) — «Mirzo Ulugʻbek tumani · Чиланзарский
   район». Archivo из макета, Onest и Golos Text проверку на U+02BB не прошли: браузер
   подставлял чужой глиф в каждое Oʻ и Gʻ.

   Файл собран scripts/fetch-inter.mjs, руками не правится. */\n\n`

const body = faces
  .map(
    (f) => `@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: ${f.weight};
  font-display: swap;
  src: url('/fonts/${f.name}') format('woff2');
  unicode-range: ${f.range};
}`,
  )
  .join('\n\n')

writeFileSync(`${OUT}/fonts.css`, `${header}${body}\n`)
console.log(`\nfonts.css: ${faces.length} подмножеств, ${(faces.reduce((s, f) => s + f.bytes, 0) / 1024).toFixed(1)} КБ всего`)
