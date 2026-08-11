import { AsyncLocalStorage } from 'node:async_hooks'

/** Correlation id живёт в `AsyncLocalStorage` (SRS §8.3): сквозной прокид через параметры
 *  потребовал бы лишнего аргумента у каждой функции на пути от контроллера до строки лога,
 *  а первый же забытый вызов дал бы событие без идентификатора — то есть ровно то, ради
 *  чего идентификатор и заводится.
 *
 *  Хранилище одно на процесс. Для HTTP значение ставит `requestIdMiddleware`, для апдейтов
 *  Telegram — webhook-контроллер, и там роль correlation id играет `update_id` (SRS §8.3). */
const storage = new AsyncLocalStorage<string>()

export function runWithCorrelationId<T>(correlationId: string, operation: () => T): T {
  return storage.run(correlationId, operation)
}

/** Пусто у того, что происходит вне запроса: воркеры, суточная задача, старт процесса.
 *  Это не дефект — у фонового прохода нет запроса, который он обслуживает. */
export function currentCorrelationId(): string | undefined {
  return storage.getStore()
}
