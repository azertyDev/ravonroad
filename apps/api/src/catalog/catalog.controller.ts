import { Controller, Get, Header } from '@nestjs/common'
import type { CategoryDto, DistrictDto } from '@ravonroad/shared-types'
import { CatalogService } from './catalog.service'

/** Сутки кэша: границы районов не меняются годами, а список категорий правится
 *  раз в несколько месяцев. Устаревший на сутки справочник дешевле, чем запрос
 *  к БД на каждое открытие формы во время всплеска (SRS §4.6). */
const CACHE_A_DAY = 'public, max-age=86400'

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('districts')
  @Header('Cache-Control', CACHE_A_DAY)
  findDistricts(): Promise<DistrictDto[]> {
    return this.catalog.findDistricts()
  }

  @Get('categories')
  @Header('Cache-Control', CACHE_A_DAY)
  findCategories(): Promise<CategoryDto[]> {
    return this.catalog.findActiveCategories()
  }
}
