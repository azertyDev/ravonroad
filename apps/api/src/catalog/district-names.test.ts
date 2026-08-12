import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Названия районов житель читает на своём языке (US-015), и живут они в трёх местах:
 *  датасет хокимията, сид миграции и таблица глоссария. Ни одно из них не «главнее» —
 *  но разъехаться они не имеют права, потому что расхождение видно только на экране
 *  и только тому, кто знает, как район называется на самом деле.
 *
 *  Сравнение посимвольное: `ʻ` (U+02BB) и `ʼ` (U+02BC) при копировании через редактор
 *  или через чужой терминал превращаются в ASCII-апостроф молча, и на глаз разница
 *  между `Ulugʻbek` и `Ulug'bek` не читается вовсе (AC-2). */
/** Путь от корня пакета, а не от `import.meta.url`: apps/api собирается в CommonJS
 *  ради NestJS, и `tsc --noEmit` запрещает там meta-property. Vitest запускает пакет
 *  из его собственного каталога, поэтому `cwd` — это apps/api. */
const ROOT = resolve(process.cwd(), '../..')

interface DistrictNames {
  code: string
  nameUz: string
  nameRu: string
}

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8')
}

function byCode(districts: DistrictNames[]): DistrictNames[] {
  return [...districts].sort((left, right) => left.code.localeCompare(right.code))
}

/** Источник истины: официальные данные, из которых собран и сид, и глоссарий. */
function fromGeoJson(): DistrictNames[] {
  const collection: { features: { properties: Record<string, unknown> }[] } = JSON.parse(
    read('data/geo/tashkent-districts.geojson'),
  )
  return collection.features.map((feature) => ({
    code: String(feature.properties['code']),
    nameUz: String(feature.properties['name_uz']),
    nameRu: String(feature.properties['name_ru']),
  }))
}

/** Сид лежит в миграции, а не в скрипте: пустая таблица district — это неработающий
 *  геозабор, то есть отклонённая заявка на каждую яму (0002_district_and_category). */
function fromMigration(): DistrictNames[] {
  const sql = read('apps/api/prisma/migrations/0002_district_and_category/migration.sql')
  const rows = sql.matchAll(/SELECT '([a-z-]+)', '([^']+)', '([^']+)', '([^']+)', \d+,/g)
  return [...rows].map((row) => ({ code: row[1] ?? '', nameUz: row[2] ?? '', nameRu: row[3] ?? '' }))
}

/** Таблица глоссария — единый язык проекта: её читает человек, а не код, и именно
 *  поэтому она успевает устареть незаметно (docs/domain/glossary.md). */
function fromGlossary(): DistrictNames[] {
  const table = read('docs/domain/glossary.md').split('## Районы Ташкента')[1] ?? ''
  const rows = table.matchAll(/^\| `([a-z-]+)` \| (.+?) \| (.+?) \|$/gm)
  // Шапка таблицы подходит под тот же шаблон: в ней `code` — тоже слово из строчных букв.
  return [...rows]
    .filter((row) => row[1] !== 'code')
    .map((row) => ({
      code: row[1] ?? '',
      nameUz: (row[2] ?? '').trim(),
      nameRu: (row[3] ?? '').trim(),
    }))
}

const DISTRICT_COUNT = 12

describe('названия районов', () => {
  const source = byCode(fromGeoJson())

  it('датасет содержит 12 районов', () => {
    expect(source).toHaveLength(DISTRICT_COUNT)
  })

  it('сид миграции совпадает с датасетом посимвольно (AC-2)', () => {
    expect(byCode(fromMigration())).toEqual(source)
  })

  it('таблица глоссария совпадает с датасетом посимвольно (AC-2)', () => {
    expect(byCode(fromGlossary())).toEqual(source)
  })

  it('узбекские названия набраны модификаторными буквами, а не ASCII-апострофом', () => {
    for (const district of source) {
      expect(district.nameUz).not.toMatch(/['‘’]/)
    }
    // Контроль: хотя бы одно название действительно содержит U+02BB — иначе проверка
    // выше проходила бы и на датасете, где апострофы просто вырезали.
    expect(source.map((district) => district.nameUz)).toContain('Mirzo Ulugʻbek tumani')
  })
})
