/** Справочники формы (SRS §4.6). Оба ответа кэшируются на сутки, поэтому в них нет
 *  ничего, что зависит от заявителя. */

/** Прямоугольник района — чтобы «подогнать карту под район» (US-031) не требовало
 *  обращения к PostGIS в рантайме: bbox считается один раз при сиде (SRS §2.6). */
export interface DistrictBbox {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

export interface DistrictDto {
  code: string
  nameUz: string
  nameRu: string
  bbox: DistrictBbox
}

/** `code` — `string`, а не union: категории это строки таблицы, а не тип (SRS §2.5).
 *  Исчерпывающего списка на этапе компиляции не существует, потому что его нет
 *  и в реальности — категория добавляется `INSERT`ом, без миграции и передеплоя.
 *  Отсюда же названия в ответе: переводы категорий живут в БД, а не в словаре локали. */
export interface CategoryDto {
  code: string
  nameUz: string
  nameRu: string
}
