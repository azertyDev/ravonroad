import { Injectable } from '@nestjs/common'
import type { DistrictCodeRow } from '@ravonroad/shared-types'
import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Район по точке — и геозабор одним запросом: это одна операция с двумя исходами,
   *  а не две проверки (SRS §3.3). `null` означает «вне города», и тогда заявка
   *  не создаётся вовсе — до единого байта в S3 (SRS §5.3 п.3).
   *
   *  Эксклав Мирзо-Улугбекского района обрабатывается сам собой: он часть
   *  `MultiPolygon` этого района, и специального кода не требует — требуется только
   *  не разбивать мультиполигон на строки при сиде (SRS §2.6).
   *
   *  `geom` хранится как `geography` ради честных метров в `ST_DWithin`, а для
   *  `ST_Contains` приводится к `geometry`: в PostGIS `ST_Contains` определён именно
   *  для неё, а на масштабе города разница между сферой и плоскостью меньше точности
   *  самих границ.
   *
   *  `LIMIT 1` стоит не «на всякий случай»: пересечений между районами нет
   *  (проверено сеткой из 2940 точек при сборке датасета, data/geo/README.md),
   *  и `LIMIT 1` фиксирует это ожидание. */
  async findDistrictCode(latitude: number, longitude: number): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<DistrictCodeRow[]>`
      SELECT code
        FROM district
       WHERE ST_Contains(geom::geometry,
                         ST_SetSRID(ST_MakePoint(${longitude}::float8, ${latitude}::float8), 4326))
       LIMIT 1`
    return rows[0]?.code ?? null
  }
}
