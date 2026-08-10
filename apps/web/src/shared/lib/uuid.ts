/** UUID v4 для ключа идемпотентности и ключей списка.
 *
 *  `crypto.randomUUID` существует только в защищённом контексте: https или localhost.
 *  Dev-стенд открыт по http на IP-адресе, и там вызов падает с `TypeError`, унося
 *  всю страницу в error boundary ещё до первой отрисовки формы. `getRandomValues`
 *  доступен и по http, поэтому значение собирается из него: тот же формат и тот же
 *  источник случайности, просто без сахара.
 *
 *  Индексов здесь нет намеренно — `noUncheckedIndexedAccess` делает чтение по индексу
 *  `number | undefined`, а версия и вариант проставляются прямо в map по номеру байта. */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte, index) => {
    // Байт 6 несёт версию (0100), байт 8 — вариант RFC 4122 (10xx).
    const tagged = index === 6 ? (byte & 0x0f) | 0x40 : index === 8 ? (byte & 0x3f) | 0x80 : byte
    return tagged.toString(16).padStart(2, '0')
  }).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
