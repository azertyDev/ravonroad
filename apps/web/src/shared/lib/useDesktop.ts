import { useSyncExternalStore } from 'react'

/** Порог десктопной раскладки читается из токена Tailwind, а не повторяется числом:
 *  разъехавшись с CSS, он поднимал бы карту там, где колонки под неё уже нет.
 *  Список создаётся один раз на страницу — `matchMedia` не бесплатен, а спрашивают его
 *  на каждый рендер. */
let media: MediaQueryList | null = null

function list(): MediaQueryList {
  if (media === null) {
    const token = getComputedStyle(document.documentElement).getPropertyValue('--breakpoint-lg').trim()
    media = matchMedia(`(min-width: ${token === '' ? '1100px' : token})`)
  }
  return media
}

/** Ноутбук ли это.
 *
 *  Нужен там, где раскладка не просто переставляется, а решает, создавать ли объект:
 *  вторая карта MapLibre на телефоне — это ещё один разбор PMTiles и ещё один холст
 *  на устройстве, у которого их и так два. Спрятать её классом `lg:` мало — скрытая
 *  карта грузится ровно так же.
 *
 *  `useSyncExternalStore`, а не `useState` с подпиской: между рендером и подпиской
 *  успевает пройти поворот экрана, и React обязан перечитать значение сам. */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = list()
      query.addEventListener('change', notify)
      return () => query.removeEventListener('change', notify)
    },
    () => list().matches,
    // Разметки на сервере нет, но правило одно: снапшот для гидрации обязан быть
    // постоянным. Телефон — то, от чего проектируется весь интерфейс.
    () => false,
  )
}
