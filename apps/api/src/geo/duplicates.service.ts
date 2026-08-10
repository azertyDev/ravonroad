import { Injectable } from '@nestjs/common'
import type { DuplicateCandidateRow } from '@ravonroad/shared-types'
import { PrismaService } from '../prisma/prisma.service'

/** Радиус, в котором две заявки считаются вероятными дублями. Проектный ориентир:
 *  соседние ямы на одной улице обычно дальше, а три соседа, снимающих одну яму,
 *  промахиваются пином на 10–30 м (SRS §3.2). Порог пересматривается на 30-й день. */
const RADIUS_M = 50

/** Предфильтр по btree-индексу (latitude, longitude): ±55 м на широте 41°. Он отсекает
 *  почти всё, и `ST_DWithin` считается на единицах строк, а не на всей таблице. */
const LATITUDE_DELTA = 0.0005
const LONGITUDE_DELTA = 0.00067

@Injectable()
export class DuplicatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Корень кластера вероятных дублей для новой точки или `null`, если рядом никого.
   *
   *  Результат — **гипотеза системы, а не решение**: он пишется
   *  в `duplicate_candidate_of_id` и статус не меняет никогда. Решение о дубле
   *  принимает модератор (US-021).
   *
   *  Связь — звезда, а не граф: новая заявка цепляется к самой ранней открытой заявке
   *  в радиусе, а если та сама кандидат — к её корню. Транзитивного замыкания не строим,
   *  оно потребовало бы рекурсивного запроса и перестроения при каждом статусе. Хватает
   *  одного шага: корень выбирался тем же правилом, когда создавалась та заявка.
   *
   *  `REJECTED` исключён: мусорная отправка не должна собирать вокруг себя кластер. */
  async findCandidateRootId(latitude: number, longitude: number): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<DuplicateCandidateRow[]>`
      SELECT id, duplicate_candidate_of_id
        FROM report
       WHERE latitude  BETWEEN ${latitude - LATITUDE_DELTA}::decimal  AND ${latitude + LATITUDE_DELTA}::decimal
         AND longitude BETWEEN ${longitude - LONGITUDE_DELTA}::decimal AND ${longitude + LONGITUDE_DELTA}::decimal
         AND status <> 'REJECTED'
         AND ST_DWithin(
               ST_MakePoint(longitude::float8, latitude::float8)::geography,
               ST_MakePoint(${longitude}::float8, ${latitude}::float8)::geography,
               ${RADIUS_M}::float8)
       ORDER BY created_at, id
       LIMIT 1`

    const nearest = rows[0]
    if (nearest === undefined) return null
    return nearest.duplicate_candidate_of_id ?? nearest.id
  }
}
