import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface RecordedStorageRequest {
  method: string
  path: string
  contentType: string | undefined
  cacheControl: string | undefined
  contentDisposition: string | undefined
  authorization: string | undefined
}

export interface FakeStorage {
  endpoint: string
  bucket: string
  publicBaseUrl: string
  /** Содержимое бакета: ключ → байты. */
  objects: Map<string, Buffer>
  requests: RecordedStorageRequest[]
  /** Пока `true`, каждый запрос получает 503 — так проверяется недоступность хранилища. */
  failing: boolean
  close: () => Promise<void>
}

const BUCKET = 'ravonroad-test-photos'

/** Хранилище заменяется локальным сервером на `node:http` — тем же приёмом, каким SRS §11.3
 *  заменяет Telegram. Проверяется наша граница: метод, путь, заголовки и подпись реального
 *  клиента AWS. Долговечность самого S3 — гарантия провайдера, а не наш код (SRS §11.5). */
export async function startFakeStorage(): Promise<FakeStorage> {
  const objects = new Map<string, Buffer>()
  const requests: RecordedStorageRequest[] = []
  const state = { failing: false }

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      // Клиент AWS дописывает к адресу ?x-id=PutObject; для ключа это шум.
      const path = (request.url ?? '').split('?')[0] ?? ''
      const key = path.replace(`/${BUCKET}/`, '')
      requests.push({
        method: request.method ?? '',
        path,
        contentType: request.headers['content-type'],
        cacheControl: request.headers['cache-control'],
        contentDisposition: request.headers['content-disposition'],
        authorization: request.headers['authorization'],
      })

      if (state.failing) {
        response.writeHead(503).end()
        return
      }
      // HEAD по бакету, а не по объекту: так `/health/details` проверяет доступность
      // хранилища целиком (SRS §10.1).
      if (request.method === 'HEAD' && (path === `/${BUCKET}` || path === `/${BUCKET}/`)) {
        response.writeHead(200).end()
        return
      }
      if (request.method === 'PUT') {
        objects.set(key, Buffer.concat(chunks))
        response.writeHead(200).end()
        return
      }
      if (request.method === 'DELETE') {
        objects.delete(key)
        response.writeHead(204).end()
        return
      }
      const body = objects.get(key)
      if (body === undefined) {
        response.writeHead(404).end()
        return
      }
      response.writeHead(200, { 'content-length': String(body.byteLength) })
      response.end(request.method === 'HEAD' ? undefined : body)
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const endpoint = `http://127.0.0.1:${port}`

  return {
    endpoint,
    bucket: BUCKET,
    publicBaseUrl: `${endpoint}/${BUCKET}`,
    objects,
    requests,
    get failing() {
      return state.failing
    },
    set failing(value: boolean) {
      state.failing = value
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

/** Кладёт адреса хранилища в окружение до сборки приложения: `S3_*` обязательны
 *  с этого среза, и без них процесс не поднимается вовсе. */
export function applyStorageEnv(storage: FakeStorage): void {
  process.env['S3_ENDPOINT'] = storage.endpoint
  process.env['S3_REGION'] = 'us-central1'
  process.env['S3_BUCKET'] = storage.bucket
  process.env['S3_ACCESS_KEY_ID'] = 'test-key'
  process.env['S3_SECRET_ACCESS_KEY'] = 'test-secret'
  process.env['S3_PUBLIC_BASE_URL'] = storage.publicBaseUrl
}
