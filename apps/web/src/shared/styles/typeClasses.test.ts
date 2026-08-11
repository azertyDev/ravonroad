import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Шрифтовые шорткаты — обычные классы, а не утилиты Tailwind: `t-h2` в разметке
 *  ничего не значит, пока `.t-h2` не объявлен в index.css. Опечатка и забытое
 *  объявление выглядят одинаково — никак: браузер просто рисует текст кеглем тела,
 *  и на экране это читается как «дизайнер так задумал».
 *
 *  Проверка появилась после реального дефекта: шкала направления C принесла токены
 *  `--t-h2` и `--t-h3`, классы под них не завели, и заголовок формы и марка в шапке
 *  полгектара экрана рисовались 16-м вместо 20-го и 17-го. Родственная проверка на
 *  `var()` без объявленного токена лежит в tokens/theme.test.ts — она ловит ту же
 *  ошибку этажом ниже. */
const SRC = fileURLToPath(new URL('../../', import.meta.url))

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = `${directory}${entry}`
    if (statSync(path).isDirectory()) return sources(`${path}/`)
    return entry.endsWith('.tsx') || entry.endsWith('.ts') ? [path] : []
  })
}

describe('шрифтовые шорткаты', () => {
  it('каждый использованный класс t-* объявлен в index.css', () => {
    const css = readFileSync(`${SRC}index.css`, 'utf8')
    const declared = new Set(Array.from(css.matchAll(/^\.t-[a-z0-9-]+/gm), ([name]) => name.slice(1)))

    // Только литералы классов: `t-` встречается и в чужих словах, поэтому берутся
    // подряд идущие имена внутри строковых литералов className, а не весь текст файла.
    const used = new Set<string>()
    for (const file of sources(SRC)) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
      for (const [name] of readFileSync(file, 'utf8').matchAll(/(?<![\w-])t-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
        used.add(name)
      }
    }

    expect([...used].filter((name) => !declared.has(name)).sort()).toEqual([])
  })
})
