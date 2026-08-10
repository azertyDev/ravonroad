import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common'
import { FilesInterceptor } from '@nestjs/platform-express'
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_REPORT, type CreateReportResponse } from '@ravonroad/shared-types'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ApiException } from '../common/api-error'
import { clientIp } from '../common/client-ip'
import { parseCreateReport } from './create-report.input'
import { ReportsService, type UploadedPhoto } from './reports.service'
import { UploadInterceptor } from './upload.interceptor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Единственный вход в систему (SRS §1.3).
   *
   *  Порядок перехватчиков — часть требования, а не деталь оформления: `UploadInterceptor`
   *  стоит первым и берёт пропуск семафора **до** того, как multer начнёт складывать файлы
   *  в память (SRS §5.3 п.1). */
  @Post()
  @UseInterceptors(
    UploadInterceptor,
    FilesInterceptor('photos', MAX_PHOTOS_PER_REPORT, {
      limits: { fileSize: MAX_PHOTO_BYTES, files: MAX_PHOTOS_PER_REPORT },
    }),
  )
  async create(
    @UploadedFiles() photos: UploadedPhoto[] | undefined,
    @Body() body: Record<string, unknown>,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ): Promise<CreateReportResponse> {
    // Ключ обязателен: без него три нажатия «повторить» на плохой сети дали бы три
    // заявки про одну яму, и разгребал бы это модератор (US-016).
    if (idempotencyKey === undefined || !UUID.test(idempotencyKey)) {
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Idempotency-Key must be a uuid', [
        { field: 'Idempotency-Key', code: 'REQUIRED' },
      ])
    }

    const parsed = parseCreateReport(body)
    if (!parsed.ok) {
      throw new ApiException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'invalid form', parsed.errors)
    }

    const outcome = await this.reports.create(parsed.value, photos ?? [], {
      idempotencyKey,
      clientIp: clientIp(request),
    })

    // Повтор отвечает 200, а не 201: заявка в этот раз не создавалась. Клиенту всё равно,
    // но разница видна в логах, и по ней считается, сколько отправок доходит с первого раза.
    response.statusCode = outcome.replayed ? HttpStatus.OK : HttpStatus.CREATED
    return outcome.response
  }
}
