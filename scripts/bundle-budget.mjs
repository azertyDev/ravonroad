#!/usr/bin/env node
// Гейт бюджета трафика: первая загрузка страницы — не более 700 КБ собственного кода
// в сжатом виде (PRD §8.1). Житель открывает сайт стоя у ямы, на платном мобильном
// интернете, и страница не должна стоить ему заметных денег.
//
// Считается br: nginx официального образа отдаёт gzip, но порог PRD задан по brotli,
// и мерить надо по нему, а не по тому, что удобно раздавать.
// Шрифты в бюджет не входят — их разбивка в SRS §7.7 не учитывает, а unicode-range
// грузит только нужные субсеты.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'

const DIST = 'apps/web/dist'
const BUDGET_BYTES = 700 * 1024
const COUNTED = new Set(['.js', '.css', '.html'])

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return walk(path)
    return COUNTED.has(path.slice(path.lastIndexOf('.'))) ? [path] : []
  })
}

function brotliSize(path) {
  return brotliCompressSync(readFileSync(path), {
    params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
  }).byteLength
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} КБ`
}

if (!statSync(DIST, { throwIfNoEntry: false })?.isDirectory()) {
  console.error(`Нет сборки в ${DIST}. Сначала pnpm build.`)
  process.exit(1)
}

const files = walk(DIST).sort()
let total = 0

for (const file of files) {
  const size = brotliSize(file)
  total += size
  console.log(`${relative(DIST, file).padEnd(36)} ${kb(size).padStart(10)} br`)
}

console.log('-'.repeat(50))
console.log(`${'итого'.padEnd(36)} ${kb(total).padStart(10)} br из ${kb(BUDGET_BYTES)}`)

if (total > BUDGET_BYTES) {
  console.error(`\nБюджет превышен на ${kb(total - BUDGET_BYTES)}.`)
  process.exit(1)
}
