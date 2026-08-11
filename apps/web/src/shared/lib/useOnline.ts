import { useSyncExternalStore } from 'react'

function subscribe(notify: () => void): () => void {
  addEventListener('online', notify)
  addEventListener('offline', notify)
  return () => {
    removeEventListener('online', notify)
    removeEventListener('offline', notify)
  }
}

/** Есть ли связь прямо сейчас.
 *
 *  `navigator.onLine` врёт в одну сторону: `false` означает, что сети нет наверняка,
 *  `true` — только что сетевой интерфейс поднят, и до сервера это ещё ничего не говорит.
 *  Поэтому значение годится ровно на одно: сказать «нет сети» вместо «что-то пошло
 *  не так» там, где ошибка уже случилась (PRD §8.4).
 *
 *  `useSyncExternalStore`, а не `useState` с подпиской: между рендером и подпиской
 *  успевает пройти событие, и React обязан перечитать значение сам. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    // На сервере разметки нет, но правило одно на все компоненты: снапшот для гидрации
    // обязан быть постоянным, иначе React выбросит предупреждение о рассинхроне.
    () => true,
  )
}
