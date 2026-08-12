import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { uzUi } from './uz'

/** Полнота словаря проверяется с двух сторон, и обе — машиной.
 *
 *  Сверху вниз это делает тип: `t()` принимает только объявленный ключ, и опечатка
 *  ломает `pnpm typecheck`. Снизу вверх — этот файл: он читает исходники экранов
 *  и следит, чтобы (1) в разметке не осталось строк мимо словаря и (2) в словаре
 *  не осталось ключей мимо разметки. Второе не менее важно первого: мёртвый ключ
 *  переводят, вычитывают и держат в обеих локалях, а показать его негде. */
const SRC = fileURLToPath(new URL('../../', import.meta.url))

/** Файлы словарей читать незачем: в них ключ стоит по определению. Тесты — тоже:
 *  тест вправе назвать ключ, но использованием это не делает. */
const SKIP = /(?:\.test\.tsx?|i18n\/(?:uz|ru|messages)\.ts)$/

function sources(): { path: string; code: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/.test(name) && !SKIP.test(name))
    .map((name) => ({ path: name, code: readFileSync(SRC + name, 'utf8') }))
}

/** Комментарии вырезаются до разбора: половина пояснений в этом коде написана
 *  по-русски, и без вырезания каждое из них выглядело бы как забытая строка. */
function withoutComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const FILES = sources()
const ALL = FILES.map((file) => withoutComments(file.code)).join('\n')

/** Ключи, которые собираются на лету: `t(\`status.${status}\`)` и `t(reasonKey(code))`.
 *  Литерала такого ключа в исходниках нет и быть не может — засчитывается семейство. */
const DYNAMIC_PREFIXES = [...ALL.matchAll(/`([a-z]+)\.\$\{/g)].map((match) => `${match[1] ?? ''}.`)

/** Формы множественного числа дописывает `tp`, а вызов называет только основу. */
const PLURAL_FORMS = ['one', 'few', 'many', 'other']

function isUsed(key: string): boolean {
  if (ALL.includes(`'${key}'`) || ALL.includes(`"${key}"`)) return true
  if (DYNAMIC_PREFIXES.some((prefix) => key.startsWith(prefix))) return true
  const form = PLURAL_FORMS.find((suffix) => key.endsWith(`.${suffix}`))
  return form !== undefined && ALL.includes(`'${key.slice(0, -form.length - 1)}'`)
}

/** Кириллица в разметке — это строка, которую забыли положить в словарь: на узбекской
 *  странице она останется русской. Проверка идёт по кодовой точке, а не по смыслу,
 *  поэтому ловит и подпись кнопки, и `aria-label`, и `alt`. */
const CYRILLIC = /[А-Яа-яЁё]/

function cyrillicOutsideComments(code: string): string[] {
  return withoutComments(code)
    .split('\n')
    .filter((line) => CYRILLIC.test(line))
}

describe('экраны говорят словарём (AC-1, AC-2)', () => {
  it('читает исходники, а не пустоту', () => {
    // Без этой проверки сломавшийся обход каталога сделал бы зелёными все остальные.
    expect(FILES.length).toBeGreaterThan(40)
    expect(FILES.some((file) => file.path.endsWith('ReportForm.tsx'))).toBe(true)
  })

  it('не держит ключей, которых нет ни на одном экране', () => {
    const dead = Object.keys(uzUi).filter((key) => !isUsed(key))

    expect(dead).toEqual([])
  })

  it('видит семейства ключей, собранные из кода', () => {
    // Контроль самой поблажки: `status.` и `reason.` обязаны попадать в неё именно
    // как семейства, иначе правило выше молча прощало бы любой ключ.
    expect(DYNAMIC_PREFIXES).toContain('status.')
    expect(DYNAMIC_PREFIXES).toContain('reason.')
    expect(isUsed('status.NEW')).toBe(true)
    expect(isUsed('form.title')).toBe(true)
    expect(isUsed('form.this.key.does.not.exist')).toBe(false)
  })

  it('не оставляет русских строк в разметке экранов (US-015)', () => {
    const guilty = FILES.filter((file) => file.path.endsWith('.tsx')).flatMap((file) =>
      cyrillicOutsideComments(file.code).map((line) => `${file.path}: ${line.trim()}`),
    )

    expect(guilty).toEqual([])
  })
})
