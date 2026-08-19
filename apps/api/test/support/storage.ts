import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

/** Публичный адрес сайта в тестах. Из него `PhotoStorage` собирает ссылки на фотографии:
 *  отдельного адреса хранилища больше нет (ADR-0009). */
const SITE_URL = 'http://localhost'

/** Каталог промежуточных файлов внутри хранилища. Знать о нём тесту приходится: именно
 *  его увод в сторону изображает отказ диска — см. `failing`. */
const TMP_DIR = '.tmp'

/** Содержимое хранилища как карта «ключ → байты». Читается с диска на каждое обращение,
 *  а не кэшируется: между двумя строками теста файл кладёт воркер, и снимок состояния
 *  устарел бы ровно там, где тест его и проверяет. */
export interface StoredObjects {
  get: (key: string) => Buffer | undefined
  has: (key: string) => boolean
  clear: () => void
  readonly size: number
}

export interface FakeStorage {
  /** Корень хранилища. Он же уезжает в `MEDIA_ROOT`. */
  root: string
  /** Читается из окружения, а не запоминается при создании: адрес сайта ставит тот,
   *  кто поднимает приложение, и подменять его хранилищу нечего — ссылки на фотографии
   *  теперь живут на том же origin (ADR-0009). */
  readonly publicBaseUrl: string
  objects: StoredObjects
  /** Пока `true`, любая запись падает — так проверяется недоступность хранилища. */
  failing: boolean
  close: () => Promise<void>
}

function walk(root: string, dir: string, keys: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === TMP_DIR) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(root, full, keys)
    else keys.push(relative(root, full).split(sep).join('/'))
  }
}

/** Хранилище — это каталог во временной файловой системе, и подменять в нём нечего:
 *  с переездом на диск (ADR-0009) настоящая реализация и есть файловые операции.
 *  Прежний фейк на `node:http` изображал S3 и проверял подпись SigV4 — проверять стало
 *  нечего, а долговечность диска гарантирует не наш код (SRS §11.5). */
export async function startFakeStorage(): Promise<FakeStorage> {
  const root = mkdtempSync(join(tmpdir(), 'ravonroad-photos-'))
  mkdirSync(join(root, TMP_DIR), { recursive: true })
  // Соседний путь, а не файл внутри корня: `objects.clear()` подметает корень целиком,
  // и маркер, лежащий внутри, он же и удалял бы — отказ переставал сниматься, а падать
  // начинали все последующие тесты файла, причём далеко от места поломки.
  const disabled = `${root}-tmp-off`

  const objects: StoredObjects = {
    get(key) {
      const file = join(root, key)
      return existsSync(file) && statSync(file).isFile() ? readFileSync(file) : undefined
    },
    has(key) {
      const file = join(root, key)
      return existsSync(file) && statSync(file).isFile()
    },
    clear() {
      for (const entry of readdirSync(root)) {
        if (entry === TMP_DIR) continue
        rmSync(join(root, entry), { recursive: true, force: true })
      }
    },
    get size() {
      const keys: string[] = []
      walk(root, root, keys)
      return keys.length
    },
  }

  return {
    root,
    get publicBaseUrl() {
      return `${(process.env['PUBLIC_SITE_URL'] ?? SITE_URL).replace(/\/+$/, '')}/media`
    },
    objects,
    /** Отказ изображается уводом каталога промежуточных файлов, а не правами доступа:
     *  под root права не значат ничего, и тест, зелёный на ноутбуке, молча перестал бы
     *  проверять отказ в контейнере CI. Запись идёт через `.tmp` — нет каталога,
     *  нет записи, и это верно для любого пользователя. */
    get failing() {
      return existsSync(disabled)
    },
    set failing(value: boolean) {
      const tmp = join(root, TMP_DIR)
      if (value && existsSync(tmp)) renameSync(tmp, disabled)
      if (!value && existsSync(disabled)) renameSync(disabled, tmp)
    },
    close: () => {
      rmSync(root, { recursive: true, force: true })
      rmSync(disabled, { recursive: true, force: true })
      return Promise.resolve()
    },
  }
}

/** Кладёт путь хранилища в окружение до сборки приложения: `MEDIA_ROOT` обязателен
 *  с 002, и без него процесс не поднимается вовсе.
 *
 *  `PUBLIC_SITE_URL` здесь **не трогается**, хотя ссылки на фотографии теперь собираются
 *  из него: адрес сайта ставит тот, кто поднимает приложение, и подмена его хранилищем
 *  ломала бы проверки ссылок в карточках бота — они сверяют полный адрес. */
export function applyStorageEnv(storage: FakeStorage): void {
  process.env['MEDIA_ROOT'] = storage.root
}
