import { HttpStatus, Injectable } from '@nestjs/common'
import type { TrackView } from '@ravonroad/shared-types'
import { ApiException } from '../common/api-error'
import { S3Service } from '../media/s3.service'
import { PrismaService } from '../prisma/prisma.service'
import { DETAIL_SELECT, mapDetail } from '../reports/detail.mapper'

@Injectable()
export class TrackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** Токен — единственная capability в системе (SRS §9.2). Он даёт причину отказа,
   *  ссылку на оригинал дубля и кнопку удаления контактов. Он не даёт менять статус
   *  и не показывает сами контакты: страница получает `hasContacts`, а не значения. */
  async view(token: string): Promise<TrackView> {
    const report = await this.prisma.report.findUnique({
      where: { trackingToken: token },
      select: {
        ...DETAIL_SELECT,
        statusReason: true,
        statusReasonText: true,
        contactPhone: true,
        contactTelegram: true,
        duplicateOf: { select: { publicNumber: true } },
      },
    })
    if (report === null) throw this.notFound()

    return {
      ...mapDetail(report, (key) => this.s3.publicUrl(key)),
      statusReason: report.statusReason,
      statusReasonText: report.statusReasonText,
      duplicateOfNumber: report.duplicateOf?.publicNumber ?? null,
      hasContacts: report.contactPhone !== null || report.contactTelegram !== null,
    }
  }

  /** Идемпотентно: повторный вызов на уже очищенной заявке тоже отвечает `204`.
   *  Обоснование права на удаление — владение ссылкой; другого способа подтвердить
   *  личность без авторизации не существует (PRD §9.2.3). Заявка, фото и статус остаются. */
  async deleteContacts(token: string): Promise<void> {
    const { count } = await this.prisma.report.updateMany({
      where: { trackingToken: token },
      data: { contactPhone: null, contactTelegram: null, contactsDeletedAt: new Date() },
    })
    if (count === 0) throw this.notFound()
  }

  /** Один и тот же ответ на «не существовал» и «был удалён»: различать их значило бы
   *  подтверждать, что токен когда-то был выдан (US-013). */
  private notFound(): ApiException {
    return new ApiException('NOT_FOUND', HttpStatus.NOT_FOUND, 'tracking link is not found')
  }
}
