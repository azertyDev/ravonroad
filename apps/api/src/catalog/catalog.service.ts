import { Injectable } from '@nestjs/common'
import type { CategoryDto, DistrictDto } from '@ravonroad/shared-types'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /** 12 районов с bbox. Геометрия не отдаётся: клиенту нужен прямоугольник, чтобы
   *  подогнать карту под район (US-031), а полигоны — это 268 КБ при бюджете страницы
   *  в 700 КБ (PRD §8.1). */
  async findDistricts(): Promise<DistrictDto[]> {
    const districts = await this.prisma.district.findMany({
      select: {
        code: true,
        nameUz: true,
        nameRu: true,
        bboxMinLon: true,
        bboxMinLat: true,
        bboxMaxLon: true,
        bboxMaxLat: true,
      },
      orderBy: { nameUz: 'asc' },
    })

    return districts.map((district) => ({
      code: district.code,
      nameUz: district.nameUz,
      nameRu: district.nameRu,
      bbox: {
        minLon: district.bboxMinLon.toNumber(),
        minLat: district.bboxMinLat.toNumber(),
        maxLon: district.bboxMaxLon.toNumber(),
        maxLat: district.bboxMaxLat.toNumber(),
      },
    }))
  }

  /** Только активные: скрытая категория не должна появляться в форме, но и не ломает
   *  старые заявки, которые на неё ссылаются (SRS §2.5). */
  async findActiveCategories(): Promise<CategoryDto[]> {
    return this.prisma.category.findMany({
      where: { isActive: true },
      select: { code: true, nameUz: true, nameRu: true },
      orderBy: { sortOrder: 'asc' },
    })
  }
}
