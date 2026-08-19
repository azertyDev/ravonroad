import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  statfs,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { Injectable, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/** Каталог промежуточных файлов атомарной записи. Лежит внутри `MEDIA_ROOT`, потому что
 *  `rename` атомарен только в пределах одной файловой системы: положи мы его в `/tmp`,
 *  и на машине с отдельным томом под фотографии переименование стало бы копированием
 *  с частично видимым результатом. */
const TMP_DIR = '.tmp'

/** Ключ приходит только из `object-keys.ts` и снаружи не управляется, но проверка стоит
 *  здесь всё равно: это граница между базой и файловой системой. Один незамеченный `../`
 *  в ключе превращает «удалить фотографию» в «удалить что угодно на диске». */
const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]*$/

@Injectable()
export class PhotoStorage implements OnModuleInit {
  private readonly root: string
  private readonly publicBaseUrl: string

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('MEDIA_ROOT'))
    // Фотографии раздаёт наш же edge по /media/ (ADR-0009), поэтому отдельного адреса
    // хранилища больше нет: он выводится из адреса сайта. Одной переменной меньше — и
    // одним способом рассинхронизировать ссылку с реальностью меньше.
    this.publicBaseUrl = `${config.getOrThrow<string>('PUBLIC_SITE_URL').replace(/\/+$/, '')}/media`
  }

  /** Проверка прав на старте, а не на первой фотографии от жителя. Раньше эту роль играли
   *  обязательные `S3_*` в валидации окружения: без хранилища заявка не принимается вовсе,
   *  и узнать об этом надо до того, как кто-то нажал «отправить». Каталог может
   *  существовать и при этом быть чужим — том смонтирован от другого uid, — поэтому
   *  проверяется запись, а не наличие. */
  async onModuleInit(): Promise<void> {
    await mkdir(join(this.root, TMP_DIR), { recursive: true })
    if (!(await this.writable())) {
      throw new Error(`MEDIA_ROOT ${this.root} недоступен для записи — фотографии сохранять некуда`)
    }
  }

  /** Сырые байты в `incoming/`. Тип содержимого не сохраняется и в подписи не нужен:
   *  он был нужен S3, чтобы отдать заголовок при чтении, а сырой файл наружу не отдаётся
   *  никогда — его читает только воркер и читает как байты (SRS §5.3 п.6, §9.6). */
  async putRaw(key: string, body: Buffer): Promise<void> {
    await this.write(key, body)
  }

  /** Итоговое изображение или превью. Всегда JPEG: всё перекодировано, исходные байты
   *  не сохраняются нигде (SRS §9.6). Заголовки кэширования выставляет edge — на диске
   *  их хранить негде, и это единственное, что переехало из объекта в конфигурацию. */
  async putImage(key: string, body: Buffer): Promise<void> {
    await this.write(key, body)
  }

  async getObject(key: string): Promise<Buffer> {
    return readFile(this.path(key))
  }

  /** Ключ содержит хеш содержимого, поэтому существующий файл — это ровно те же байты.
   *  Проверка экономит перезапись при повторе одного и того же снимка. */
  async exists(key: string): Promise<boolean> {
    try {
      await access(this.path(key), constants.F_OK)
      return true
    } catch {
      return false
    }
  }

  /** Для `/health/details` (SRS §10.1). У бакета проверялась достижимость по сети,
   *  у диска — право записи: сеть тут ни при чём, а том, смонтированный только на чтение,
   *  и кончившееся место выглядят снаружи одинаково — заявки перестают приниматься. */
  async writable(): Promise<boolean> {
    const probe = join(this.root, TMP_DIR, `probe-${randomUUID()}`)
    try {
      await writeFile(probe, '')
      await unlink(probe)
      return true
    } catch {
      return false
    }
  }

  /** Свободное место под фотографиями. На S3 этого вопроса не существовало; на диске он
   *  первый по важности: место кончается раньше памяти и кончается тихо (SRS §12.2 п.5). */
  async freeBytes(): Promise<number | null> {
    try {
      const fs = await statfs(this.root)
      return Number(fs.bavail) * Number(fs.bsize)
    } catch {
      return null
    }
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.path(key), { force: true })
  }

  /** Заменяет lifecycle-правило бакета «удалять `incoming/` старше суток», которого вместе
   *  с бакетом не стало (ADR-0009). Сирота появляется, когда приём упал между записью
   *  байтов и коммитом транзакции: строки в БД нет, файл есть, и удалить его больше некому.
   *
   *  Возвращает число удалённых — вызывающий пишет его в лог, иначе о работе сборщика
   *  нельзя узнать вообще ничего. */
  async sweepIncoming(olderThanMs: number): Promise<number> {
    const dir = join(this.root, 'incoming')
    const now = Date.now()
    let removed = 0
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return 0
    }
    for (const name of names) {
      const file = join(dir, name)
      try {
        const info = await stat(file)
        if (now - info.mtimeMs < olderThanMs) continue
        await unlink(file)
        removed += 1
      } catch {
        // Файл забрал воркер, пока мы его разглядывали. Это не ошибка: сборщик подчищает
        // забытое, а не соревнуется с обработкой.
      }
    }
    return removed
  }

  /** Чтение публичное и идёт через edge, минуя api: раздача файлов приложением стоила бы
   *  памяти на каждый снимок. Отдельного домена у фотографий больше нет — они на нашем
   *  origin, поэтому за исполнение чужого содержимого отвечают `nosniff`, `inline`
   *  и то, что всё перекодировано в JPEG (SRS §9.6, ADR-0009). */
  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`
  }

  /** Запись через временный файл и `rename`. Прямая запись в конечный путь оставила бы
   *  при падении процесса обрезанный JPEG под ключом, который по построению считается
   *  неизменяемым: браузер закэшировал бы битый файл на год. */
  private async write(key: string, body: Buffer): Promise<void> {
    const target = this.path(key)
    const tmp = join(this.root, TMP_DIR, randomUUID())
    await mkdir(dirname(target), { recursive: true })
    await writeFile(tmp, body)
    await rename(tmp, target)
  }

  private path(key: string): string {
    if (!SAFE_KEY.test(key)) throw new Error(`недопустимый ключ ${key}`)
    const full = resolve(this.root, key)
    if (!full.startsWith(this.root + sep)) throw new Error(`ключ ${key} уводит за пределы MEDIA_ROOT`)
    return full
  }
}
